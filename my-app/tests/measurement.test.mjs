import test from "node:test"
import assert from "node:assert/strict"
import { validateMeasurement, MeasurementError } from "../lib/measurement.mjs"
import { measurementPost } from "../lib/measurement-http.mjs"
import { ingestReading } from "../lib/ingest-reading.mjs"
import { stationWithLatestReading } from "../lib/station-data.mjs"

const payload = { mac: "aA:bB:cC:dD:eE:fF", temperature: 0, humidity: 0 }
const instant = new Date("2026-10-23T03:00:00Z")

// Transactional in-memory double: never imports Prisma or opens a connection.
function database() {
  let station = null
  let readings = []
  return {
    get station() { return station },
    get readings() { return readings },
    failReading: false,
    transactions: 0,
    async $transaction(callback) {
      this.transactions++
      const previous = structuredClone({ station, readings })
      try {
        return await callback({
          station: { upsert: async ({ where, create, update }) => {
            assert.equal(where.mac, payload.mac)
            station = station ? { ...station, ...update } : {
              id: "synthetic-station", latitude: null, longitude: null, ...create,
            }
            return station
          } },
          reading: { create: async ({ data }) => {
            if (this.failReading) throw new Error("synthetic private DB error")
            const reading = { id: "synthetic-reading", ...data }
            readings.push(reading)
            return reading
          } },
        })
      } catch (error) {
        station = previous.station
        readings = previous.readings
        throw error
      }
    },
  }
}

test("measurement objects, MAC identity, and finite environmental ranges", () => {
  for (const value of [null, [], "text", 1, false, {}]) {
    assert.throws(() => validateMeasurement(value), MeasurementError)
  }
  for (const mac of [undefined, null, 123, "", " ", "invalid", "AA-BB-CC-DD-EE-FF", "x".repeat(2049)]) {
    assert.throws(() => validateMeasurement({ ...payload, mac }), MeasurementError)
  }
  for (const mac of [payload.mac, payload.mac.toUpperCase(), payload.mac.toLowerCase()]) {
    assert.equal(validateMeasurement({ ...payload, mac }).mac, mac)
  }
  for (const [key, invalid] of [
    ["temperature", [undefined, null, "0", false, NaN, Infinity, -Infinity, -80.01, 100.01]],
    ["humidity", [undefined, null, "0", false, NaN, Infinity, -Infinity, -0.01, 100.01]],
    ["name", [123, {}, []]],
  ]) {
    for (const value of invalid) assert.throws(() => validateMeasurement({ ...payload, [key]: value }), MeasurementError)
  }
  for (const temperature of [-80, -40, 0, 80, 100]) {
    for (const humidity of [0, 100]) assert.equal(validateMeasurement({ ...payload, temperature, humidity }).temperature, temperature)
  }
})

test("coordinate pairs accept zero, negatives and limits; omission alone preserves location", () => {
  assert.equal(Object.hasOwn(validateMeasurement(payload), "lat"), false)
  for (const [lat, lon] of [[0, 0], [-90, -180], [90, 180], [-34.123456, -58.123456]]) {
    assert.deepEqual(validateMeasurement({ ...payload, lat, lon }), { ...payload, name: undefined, lat, lon })
  }
  for (const pair of [{ lat: 0 }, { lon: 0 }, { lat: undefined, lon: undefined },
    { lat: null, lon: null }, { lat: "0", lon: 0 }, { lat: 0, lon: null },
    { lat: NaN, lon: 0 }, { lat: 0, lon: Infinity }, { lat: -90.01, lon: 0 },
    { lat: 90.01, lon: 0 }, { lat: 0, lon: -180.01 }, { lat: 0, lon: 180.01 }]) {
    assert.throws(() => validateMeasurement({ ...payload, ...pair }), MeasurementError)
  }
})

test("ingestion validates direct callers and atomically creates, updates, retains and rolls back coordinates", async () => {
  const db = database()
  await assert.rejects(ingestReading(db, { ...payload, temperature: null }), MeasurementError)
  assert.equal(db.transactions, 0)
  await ingestReading(db, payload, instant)
  assert.equal(db.station.latitude, null)
  assert.equal(db.station.longitude, null)
  const originalName = db.station.name
  await ingestReading(db, { ...payload, name: "Not a rename", lat: -34, lon: -58 }, instant)
  assert.equal(db.station.name, originalName)
  await ingestReading(db, payload, instant)
  assert.equal(db.station.latitude, -34)
  assert.equal(db.station.longitude, -58)
  await ingestReading(db, { ...payload, lat: 0, lon: 0 }, instant)
  const formatted = stationWithLatestReading({ ...db.station, readings: db.readings })
  assert.equal(formatted.latitude, 0)
  assert.equal(formatted.longitude, 0)
  const previous = structuredClone({ station: db.station, readings: db.readings })
  db.failReading = true
  await assert.rejects(ingestReading(db, { ...payload, lat: 90, lon: 180 }), /synthetic private DB error/)
  assert.deepEqual({ station: db.station, readings: db.readings }, previous)
  const fresh = database()
  fresh.failReading = true
  await assert.rejects(ingestReading(fresh, { ...payload, lat: 0, lon: 0 }))
  assert.equal(fresh.station, null)
  fresh.failReading = false
  await ingestReading(fresh, { ...payload, lat: 90, lon: 180 })
  assert.equal(fresh.station.latitude, 90)
  assert.equal(fresh.station.longitude, 180)
})

for (const route of ["esp32", "weather"]) {
  test(`${route} production handler rejects malformed/oversized input without DB access`, async () => {
    const db = database()
    const post = measurementPost(db, route)
    const request = (body) => new Request(`https://example.invalid/api/${route}`, { method: "POST", body })
    for (const body of [undefined, "", "{", "null", "[]", "1", "false", '"text"', "{}",
      JSON.stringify({ ...payload, name: "Station", temperature: null }),
      JSON.stringify({ ...payload, name: "Station", lat: 0 }),
      JSON.stringify({ ...payload, name: "é".repeat(1100) }), new Uint8Array([0xff])]) {
      const response = await post(request(body))
      assert.equal(response.status, 400)
      assert.equal(typeof (await response.json()).error, "string")
    }
    let pulls = 0
    let cancelled = false
    const stream = new ReadableStream({
      pull(controller) { pulls++; controller.enqueue(new Uint8Array(1024).fill(32)) },
      cancel() { cancelled = true },
    }, { highWaterMark: 0 })
    assert.equal((await post({ body: stream })).status, 400)
    assert.equal(cancelled, true)
    assert.equal(pulls, 3)
    assert.equal(db.transactions, 0)
    const valid = JSON.stringify({ ...payload, name: "Station" })
    assert.equal((await post(request(valid.padEnd(2048, " ")))).status, 200)
    assert.equal((await post(request(valid.padEnd(2049, " ")))).status, 400)
    assert.equal(db.transactions, 1)
  })

  test(`${route} preserves success schema, ignores optional auth and returns safe DB errors`, async (t) => {
    const db = database()
    const post = measurementPost(db, route)
    const send = (data, auth) => post(new Request(`https://example.invalid/api/${route}`, {
      method: "POST", body: JSON.stringify(data), headers: auth ? { Authorization: auth } : {},
    }))
    assert.equal((await send(payload)).status, route === "weather" ? 400 : 200)
    for (const auth of [undefined, "Bearer synthetic-ignored-token"]) {
      const response = await send({ ...payload, name: "Station" }, auth)
      assert.equal(response.status, 200)
      const body = await response.json()
      if (route === "esp32") assert.deepEqual(body, {
        success: true, message: "Datos recibidos correctamente",
        station: { id: db.station.id, mac: payload.mac, name: db.station.name },
      })
      else assert.deepEqual(body, {
        success: true, message: "Datos recibidos y guardados correctamente",
        data: JSON.parse(JSON.stringify(db.readings.at(-1))),
      })
    }
    assert.equal((await send({ ...payload, name: "Station", lat: 0, lon: -180 })).status, 200)
    assert.equal(db.station.latitude, 0)
    assert.equal(db.station.longitude, -180)
    db.failReading = true
    const logs = []
    t.mock.method(console, "error", (...args) => logs.push(args))
    const response = await send({ ...payload, name: "Station" })
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { error: "Error procesando datos" })
    assert.deepEqual(logs, [["[measurement] Error procesando datos"]])
  })
}
