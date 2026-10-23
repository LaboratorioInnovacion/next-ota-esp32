import test from "node:test"
import assert from "node:assert/strict"
import { diagnosticAuthorization, diagnosticHandlers } from "../lib/diagnostics-http.mjs"
import { diagnosticQuery, ingestDiagnostic, stationHealth, validateDiagnostic } from "../lib/diagnostics.mjs"
import { sameStation, stationWithLatestReading } from "../lib/station-data.mjs"

const token = "synthetic_test_token_not_a_secret_123"
const payload = { mac: "aa:bb:cc:dd:ee:ff", name: "Station", version: "v1.0.1",
  bootId: "0123456789abcdef", uptimeMs: 0, sensorStatus: "error", errorCode: "DHT_INVALID_SAMPLE" }
const receivedAt = new Date("2026-10-23T03:00:00Z")

// In-memory transaction double exercises production ingestion; no DB or network.
function database() {
  let station = null
  let events = []
  let commits = 0
  let lockHeld = false
  let failCreate = false
  let nextId = 0
  const tx = {
    $queryRaw: async () => { lockHeld = true },
    station: {
      findUnique: async () => { assert(lockHeld); return station },
      upsert: async ({ create, update }) => {
        assert(lockHeld)
        station = station ? { ...station, ...update } : { id: "station", ...create }
        return station
      },
    },
    diagnostic: {
      create: async ({ data }) => {
        if (failCreate) throw new Error("synthetic DB failure")
        events.push({ id: String(++nextId).padStart(4, "0"), ...data })
      },
      findMany: async () => events.slice().sort((a, b) => b.receivedAt - a.receivedAt || b.id.localeCompare(a.id)).slice(0, 100).map(({ id }) => ({ id })),
      deleteMany: async ({ where }) => { events = events.filter((event) => where.id.notIn.includes(event.id)) },
    },
  }
  return {
    get station() { return station }, get events() { return events }, get commits() { return commits },
    set failCreate(value) { failCreate = value },
    async $transaction(callback) {
      const previous = structuredClone({ station, events })
      try { const result = await callback(tx); ++commits; return result }
      catch (error) { station = previous.station; events = previous.events; throw error }
      finally { lockHeld = false }
    },
  }
}

test("diagnostics validate strict bounded fields and permit zero uptime", () => {
  assert.equal(validateDiagnostic(payload).uptimeMs, 0)
  assert.equal(validateDiagnostic(payload).mac, "AA:BB:CC:DD:EE:FF")
  for (const value of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, "10", null]) {
    assert.equal(validateDiagnostic({ ...payload, uptimeMs: value }), null)
  }
  for (const value of [null, [], {}, { ...payload, timestamp: receivedAt },
    { ...payload, temperature: 0 }, { ...payload, mac: "invalid" },
    { ...payload, name: "x".repeat(65) }, { ...payload, name: "\n" },
    { ...payload, version: null }, { ...payload, bootId: "x" },
    { ...payload, sensorStatus: "ok" }, { ...payload, errorCode: "raw stack trace" }]) {
    assert.equal(validateDiagnostic(value), null)
  }
  for (const sensorStatus of ["ok", "unknown"]) assert.ok(validateDiagnostic({ ...payload, sensorStatus, errorCode: "NONE" }))
})

test("bearer authentication fails closed and rejects invalid/missing credentials", () => {
  assert.equal(diagnosticAuthorization(`Bearer ${token}`, token), 200)
  for (const header of [null, "", token, `bearer ${token}`, "Bearer wrong"]) assert.equal(diagnosticAuthorization(header, token), 401)
  for (const configured of [undefined, "", "short", token + "\n"]) assert.equal(diagnosticAuthorization(`Bearer ${token}`, configured), 503)
})

test("sensor fault persists without creating a measurement; recovery preserves last reading", async () => {
  const db = database()
  const data = validateDiagnostic(payload)
  assert.deepEqual(await ingestDiagnostic(db, data, () => receivedAt), { accepted: true })
  assert.equal(db.station.sensorStatus, "error")
  assert.equal(db.station.lastSeenAt, receivedAt)
  assert.equal(db.events.length, 1)
  const formatted = stationWithLatestReading({ ...db.station, readings: [] })
  assert.equal(formatted.temperature, null)
  assert.equal(formatted.lastValidReadingAt, null)
  await ingestDiagnostic(db, { ...data, uptimeMs: 10000, sensorStatus: "ok", errorCode: "NONE" }, () => receivedAt)
  assert.equal(db.station.sensorStatus, "ok")
  assert.equal(db.events.length, 2)
  const recovered = stationWithLatestReading({ ...db.station, readings: [{ timestamp: receivedAt, temperature: 0, humidity: 0 }] })
  assert.equal(recovered.temperature, 0)
  assert.equal(recovered.humidity, 0)
  assert.equal(recovered.lastValidReadingAt, receivedAt)
})

test("same-boot duplicates/out-of-order events never refresh lastSeen or overwrite newer sensor state", async () => {
  const db = database()
  const data = validateDiagnostic(payload)
  await ingestDiagnostic(db, { ...data, uptimeMs: 20000, sensorStatus: "ok", errorCode: "NONE" }, () => receivedAt)
  const clock = () => { throw new Error("Old event must not acquire a new receipt instant") }
  for (const uptimeMs of [20000, 10000]) assert.deepEqual(await ingestDiagnostic(db, { ...data, uptimeMs }, clock), { accepted: false })
  assert.equal(db.station.sensorStatus, "ok")
  assert.equal(db.events.length, 1)
  assert.equal(db.station.lastSeenAt, receivedAt)
})

test("event retention is bounded and failed event insertion rolls back metadata", async () => {
  const db = database()
  const data = validateDiagnostic(payload)
  for (let uptimeMs = 0; uptimeMs < 105; uptimeMs++) await ingestDiagnostic(db, { ...data, uptimeMs }, () => new Date(receivedAt.getTime() + uptimeMs))
  assert.equal(db.events.length, 100)
  assert.equal(Math.min(...db.events.map((event) => event.uptimeMs)), 5)
  const previous = structuredClone(db.station)
  db.failCreate = true
  await assert.rejects(ingestDiagnostic(db, { ...data, uptimeMs: 106, sensorStatus: "ok", errorCode: "NONE" }))
  assert.deepEqual(db.station, previous)
})

test("health distinguishes fresh sensor failure, stale connectivity, legacy unknown and recovered sensor", () => {
  const now = receivedAt.getTime()
  const fresh = { lastSeenAt: receivedAt, sensorStatus: "error" }
  assert.equal(stationHealth(fresh, now).reason, "Conectado: sensor con error")
  assert.equal(stationHealth(fresh, now + 180000).status, "online")
  assert.equal(stationHealth(fresh, now + 180001).status, "offline")
  assert.equal(stationHealth({ ...fresh, sensorStatus: "ok" }, now).reason, "Conectado: sensor operativo")
  assert.equal(stationHealth({ lastUpdate: receivedAt }, now).sensorStatus, "unknown")
  assert.equal(stationHealth({ lastUpdate: receivedAt }, now + 900001).status, "offline")
  assert.equal(stationHealth({}, now).status, "unknown")
  assert.equal(stationHealth({ lastSeenAt: new Date(now + 1) }, now).status, "offline")
  for (const key of ["lastSeenAt", "sensorStatus", "lastValidReadingAt", "firmwareVersion", "reason"]) assert.equal(sameStation({}, { [key]: "changed" }), false)
})

test("diagnostic query requires a MAC filter and caps a strictly parsed limit", () => {
  assert.deepEqual(diagnosticQuery(new URLSearchParams({ mac: payload.mac })), { mac: payload.mac.toUpperCase(), limit: 20 })
  for (const limit of ["0", "101", "1.5", "20x", "-1", "Infinity", ""]) assert.equal(diagnosticQuery(new URLSearchParams({ mac: payload.mac, limit })), null)
  assert.equal(diagnosticQuery(new URLSearchParams()), null)
})

test("POST authenticates before parsing/mutating, returns safe 4xx, and writes a valid sensor error", async () => {
  const db = database()
  const handlers = diagnosticHandlers(db, () => token)
  const request = (body, auth = `Bearer ${token}`) => new Request("https://example.invalid/api/diagnostics", {
    method: "POST", headers: { Authorization: auth }, body,
  })
  assert.equal((await handlers.POST(request("not json", "Bearer wrong"))).status, 401)
  assert.equal(db.commits, 0)
  for (const body of ["not json", "null", JSON.stringify({}), " ".repeat(2049)]) assert.equal((await handlers.POST(request(body))).status, 400)
  assert.equal(db.commits, 0)
  assert.equal((await handlers.POST(request(JSON.stringify(payload)))).status, 200)
  assert.equal(db.station.sensorStatus, "error")
  assert.equal((await diagnosticHandlers(db, () => undefined).POST(request(JSON.stringify(payload)))).status, 503)
})

test("GET passes bounded filtering and a safe explicit projection to persistence", async () => {
  let args
  const handlers = diagnosticHandlers({ diagnostic: { findMany: async (input) => { args = input; return [] } } })
  const get = (query) => handlers.GET(new Request(`https://example.invalid/api/diagnostics?${query}`))
  assert.equal((await get("limit=20")).status, 400)
  assert.equal(args, undefined)
  assert.equal((await get(`mac=${payload.mac}&limit=100`)).status, 200)
  assert.equal(args.take, 100)
  assert.equal(args.where.station.mac, payload.mac.toUpperCase())
  assert.deepEqual(Object.keys(args.select).sort(), ["errorCode", "receivedAt", "sensorStatus", "uptimeMs", "version"])
})
