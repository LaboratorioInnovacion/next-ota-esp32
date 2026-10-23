import test from "node:test"
import assert from "node:assert/strict"
import { formatArgentina, parseInstant, relativeFreshness, rollingStart } from "../lib/station-time.mjs"
import { reconcileStations, sameStation, selectStationId, stationWithLatestReading } from "../lib/station-data.mjs"
import { ingestReading } from "../lib/ingest-reading.mjs"

test("Argentina midnight is independent of the host timezone", () => {
  assert.match(formatArgentina("2026-10-23T02:59:59Z"), /22\/10\/2026.*23:59:59.*GMT-3/)
  assert.match(formatArgentina("2026-10-23T03:00:00Z"), /23\/10\/2026.*00:00:00.*GMT-3/)
  assert.equal(formatArgentina("2026-10-23T03:00:00Z"), formatArgentina("2026-10-23T00:00:00-03:00"))
})

test("freshness handles absent, invalid, future, and older readings", () => {
  const now = Date.parse("2026-10-23T03:00:00Z")
  for (const value of [null, undefined, "", "invalid"]) {
    assert.equal(parseInstant(value), null)
    assert.equal(relativeFreshness(value, now), "Sin lecturas")
    assert.equal(formatArgentina(value), "Sin lecturas")
  }
  assert.match(relativeFreshness(new Date(now + 1), now), /Fecha futura/)
  assert.equal(relativeFreshness(new Date(now), now), "Hace menos de 1 min")
  assert.equal(relativeFreshness(new Date(now - 120_000), now), "Hace 2 min")
  assert.equal(relativeFreshness(new Date(now - 7_200_000), now), "Hace 2 h")
  assert.equal(relativeFreshness(new Date(now - 172_800_000), now), "Hace 2 días")
})

test("rolling windows use exact elapsed UTC days across DST boundaries", () => {
  const now = Date.parse("2026-03-09T00:00:00Z")
  assert.equal(now - rollingStart("week", now).getTime(), 7 * 86_400_000)
  assert.equal(now - rollingStart("month", now).getTime(), 30 * 86_400_000)
})

test("latest reading, not metadata, determines lastUpdate; zero values survive", () => {
  const station = { id: "a", updatedAt: "2026-10-23T04:00:00Z", latitude: 0, longitude: 0,
    readings: [{ timestamp: "2026-10-23T03:00:00Z", temperature: 0, humidity: 0 }] }
  const formatted = stationWithLatestReading(station)
  assert.equal(formatted.lastUpdate, station.readings[0].timestamp)
  for (const key of ["temperature", "humidity", "latitude", "longitude"]) assert.equal(formatted[key], 0)
  assert.equal(stationWithLatestReading({ ...station, readings: [] }).lastUpdate, null)
})

test("unchanged polling preserves references and selection by id", () => {
  const original = [{ id: "a", name: "A" }, { id: "b", name: "B" }]
  const unchanged = reconcileStations(original, structuredClone(original))
  assert.equal(unchanged, original)
  assert.equal(selectStationId("b", unchanged), "b")
  const changed = reconcileStations(original, [{ id: "a", name: "Renamed" }, { id: "b", name: "B" }])
  assert.notEqual(changed, original)
  assert.equal(changed[1], original[1])
  assert.equal(selectStationId("b", changed), "b")
  assert.equal(selectStationId("missing", changed), "a")
  assert.equal(selectStationId("b", []), null)
  for (const key of ["name", "mac", "latitude", "longitude", "lastUpdate", "temperature", "humidity", "status"]) {
    assert.equal(sameStation(original[0], { ...original[0], [key]: "changed" }), false)
  }
})

test("ingestion atomically uses the same receipt instant for metadata and reading", async () => {
  const calls = []
  const receivedAt = new Date("2026-10-23T03:00:00Z")
  const tx = {
    station: { upsert: async (args) => { calls.push(args); return { id: "a" } } },
    reading: { create: async (args) => { calls.push(args); return args.data } },
  }
  let transactions = 0
  const prisma = { $transaction: async (callback) => { transactions++; return callback(tx) } }
  const result = await ingestReading(prisma, { mac: "test", temperature: 0, humidity: 0 }, receivedAt)
  assert.equal(transactions, 1)
  assert.equal(calls[0].create.createdAt, receivedAt)
  assert.equal(calls[0].update.updatedAt, receivedAt)
  assert.equal(calls[1].data.timestamp, receivedAt)
  assert.equal(result.reading.temperature, 0)
  assert.equal(calls[0].update.name, undefined)
})

test("failed reading propagates through the transaction boundary", async () => {
  let committed = false
  const prisma = { $transaction: async (callback) => {
    const result = await callback({
      station: { upsert: async () => ({ id: "a" }) },
      reading: { create: async () => { throw new Error("Invalid reading") } },
    })
    committed = true
    return result
  } }
  await assert.rejects(ingestReading(prisma, { mac: "test" }), /Invalid reading/)
  assert.equal(committed, false)
})
