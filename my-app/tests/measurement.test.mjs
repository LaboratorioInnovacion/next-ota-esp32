import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { validateMeasurement, MeasurementError } from "../lib/measurement.mjs"
import { measurementPost } from "../lib/measurement-http.mjs"
import { ingestReading } from "../lib/ingest-reading.mjs"
import { stationWithLatestReading } from "../lib/station-data.mjs"

const payload = { mac: "aA:bB:cC:dD:eE:fF", temperature: 0, humidity: 0 }
const instant = new Date("2026-10-23T03:00:00Z")
const token = "dummy-weather!@#$+/:=123"
const authorization = `Bearer ${token}`

// Transactional in-memory double: never imports Prisma or opens a connection.
function database() {
  let station = null
  let readings = []
  return {
    get station() { return station },
    get readings() { return readings },
    failReading: false,
    transactions: 0,
    upserts: [],
    async $transaction(callback) {
      this.transactions++
      const previous = structuredClone({ station, readings })
      try {
        return await callback({
          station: { upsert: async ({ where, create, update }) => {
            assert.equal(where.mac, payload.mac)
            this.upserts.push(structuredClone({ where, create, update }))
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
  await ingestReading(db, { ...payload, name: "Renamed station", lat: -34, lon: -58 }, instant)
  assert.equal(db.station.name, "Renamed station")
  await ingestReading(db, payload, instant)
  assert.equal(db.station.latitude, -34)
  assert.equal(db.station.longitude, -58)
  await ingestReading(db, { ...payload, lat: 0, lon: 0 }, instant)
  const formatted = stationWithLatestReading({ ...db.station, readings: db.readings })
  assert.equal(formatted.latitude, 0)
  assert.equal(formatted.longitude, 0)
  const previous = structuredClone({ station: db.station, readings: db.readings })
  db.failReading = true
  await assert.rejects(ingestReading(db, { ...payload, name: "Rolled back rename", lat: 90, lon: 180 }), /synthetic private DB error/)
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

test("authenticated ESP32 payload renames the same station without replacing history", async () => {
  const db = database()
  const post = measurementPost(db, "esp32", () => token)
  const send = (data) => post(esp32Request(authorization, JSON.stringify(data)))
  assert.equal((await send({ ...payload, name: "Original station", lat: -34, lon: -58 })).status, 200)
  const original = structuredClone({ station: db.station, readings: db.readings })
  const response = await send({ ...payload, name: "  Renamed station \t", lat: 0, lon: 0 })
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).station, {
    id: original.station.id, mac: payload.mac, name: "Renamed station",
  })
  assert.deepEqual(db.upserts.at(-1).where, { mac: payload.mac })
  assert.deepEqual(db.upserts.at(-1).update, {
    name: "Renamed station", latitude: 0, longitude: 0, status: "online", updatedAt: db.station.updatedAt,
  })
  assert.equal(db.station.createdAt.getTime(), original.station.createdAt.getTime())
  for (const nameFields of [{}, { name: null }, { name: "" }, { name: " \t\n " }]) {
    assert.equal((await send({ ...payload, ...nameFields })).status, 200)
    assert.equal(db.station.name, "Renamed station")
    assert.equal(Object.hasOwn(db.upserts.at(-1).update, "name"), false)
  }
  assert.equal(db.station.id, original.station.id)
  assert.equal(db.station.mac, original.station.mac)
  assert.equal(db.station.latitude, 0)
  assert.equal(db.station.longitude, 0)
  assert.deepEqual(db.readings[0], original.readings[0])
  assert.equal(db.readings.length, 6)
  assert.ok(db.readings.every((reading) => reading.stationId === original.station.id))
  assert.equal(db.transactions, 6)
})

test("ESP32 creation defaults only when no usable name is supplied; weather keeps its required-name check", async () => {
  for (const nameFields of [{}, { name: null }, { name: "" }, { name: " \t " }, { name: "  New station  " }]) {
    const db = database()
    const response = await measurementPost(db, "esp32", () => token)(
      esp32Request(authorization, JSON.stringify({ ...payload, ...nameFields })),
    )
    assert.equal(response.status, 200)
    assert.equal(db.station.name, nameFields.name?.trim() || `ESP32_${payload.mac.slice(-4)}`)
  }
  const db = database()
  const weather = measurementPost(db, "weather")
  for (const nameFields of [{}, { name: null }, { name: "" }]) {
    assert.equal((await weather(new Request("https://example.invalid/api/weather", {
      method: "POST", body: JSON.stringify({ ...payload, ...nameFields }),
    }))).status, 400)
  }
  assert.equal(db.transactions, 0)
})

for (const route of ["esp32", "weather"]) {
  test(`${route} production handler rejects malformed/oversized input without DB access`, async () => {
    const db = database()
    const post = measurementPost(db, route, () => token)
    const request = (body) => new Request(`https://example.invalid/api/${route}`, {
      method: "POST", body, headers: { Authorization: authorization },
    })
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
    assert.equal((await post({ body: stream, headers: new Headers({ Authorization: authorization }) })).status, 400)
    assert.equal(cancelled, true)
    assert.equal(pulls, 3)
    assert.equal(db.transactions, 0)
    const valid = JSON.stringify({ ...payload, name: "Station" })
    assert.equal((await post(request(valid.padEnd(2048, " ")))).status, 200)
    assert.equal((await post(request(valid.padEnd(2049, " ")))).status, 400)
    assert.equal(db.transactions, 1)
  })

  test(`${route} preserves success schema and returns safe DB errors`, async (t) => {
    const db = database()
    const post = measurementPost(db, route, () => token)
    const send = (data, auth = route === "esp32" ? authorization : undefined) => post(new Request(`https://example.invalid/api/${route}`, {
      method: "POST", body: JSON.stringify(data), headers: auth ? { Authorization: auth } : {},
    }))
    assert.equal((await send(payload)).status, route === "weather" ? 400 : 200)
    const headers = route === "esp32" ? [authorization, `bEaReR ${token}`] : [undefined, "Bearer synthetic-ignored-token"]
    for (const auth of headers) {
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

const esp32Request = (header = authorization, body = "{") => new Request("https://example.invalid/api/esp32", {
  method: "POST", body, headers: header === null ? {} : { Authorization: header },
})

test("ESP32 rejects invalid configuration and authentication before reading a body or accessing persistence", async (t) => {
  const logs = t.mock.method(console, "error", () => {})
  let loads = 0
  const persistence = async () => { loads++; assert.fail("Persistence must not load") }
  for (const configured of [undefined, null, 123, "", " ", "two words", token + "\n", "\t", "é"]) {
    const request = esp32Request()
    const response = await measurementPost(persistence, "esp32", () => configured)(request)
    assert.equal(response.status, 503)
    assert.equal(request.bodyUsed, false)
    assert.equal(response.headers.get("cache-control"), "no-store")
    assert.deepEqual(await response.json(), { error: "Measurement ingestion is not configured" })
  }
  const post = measurementPost(persistence, "esp32", () => token)
  for (const header of [null, "", token, "Bearer", "Bearer ", "Bearer wrong", `Basic ${token}`,
    `Bearer  ${token}`, `Bearer\t${token}`, `Bearer ${token}, Bearer ${token}`,
    `Bearer ${token.slice(1)}`, `Bearer ${token}x`, "Bearer synthetic-diagnostics-token-only"]) {
    const request = esp32Request(header)
    const response = await post(request)
    assert.equal(response.status, 401)
    assert.equal(request.bodyUsed, false)
    assert.equal(response.headers.get("cache-control"), "no-store")
    assert.deepEqual(await response.json(), { error: "Unauthorized" })
  }
  const duplicate = esp32Request()
  duplicate.headers.append("authorization", authorization)
  assert.equal((await post(duplicate)).status, 401)
  assert.equal(duplicate.bodyUsed, false)
  // Exercise strict grammar before Fetch's header whitespace normalization.
  for (const header of [` ${authorization}`, `${authorization} `, `${authorization}\n`, `${authorization}\t`]) {
    assert.equal((await post({
      headers: { get: () => header },
      get body() { assert.fail("Rejected request body must not be accessed") },
    })).status, 401)
  }
  assert.equal(loads, 0)
  assert.equal(logs.mock.callCount(), 0)
})

test("ESP32 route authenticates with the server weather env before importing Prisma, then preserves transactions", async (t) => {
  const previous = process.env.ESP32_AUTH_TOKEN
  t.after(() => {
    if (previous === undefined) delete process.env.ESP32_AUTH_TOKEN
    else process.env.ESP32_AUTH_TOKEN = previous
  })
  const source = await readFile(new URL("../app/api/esp32/route.js", import.meta.url), "utf8")
  assert.match(source, /export const runtime = "nodejs"/)
  assert.match(source, /await import\("@\/lib\/prisma"\)/)
  assert.doesNotMatch(source, /import \{ prisma \}/)
  const executable = source
    .replace('import { measurementPost } from "@/lib/measurement-http.mjs"', "")
    .replaceAll("export const ", "const ")
    .replace('import("@/lib/prisma")', "loadPrisma()")
  const db = database()
  let loads = 0
  const POST = new Function("measurementPost", "loadPrisma", `${executable}\nreturn POST`)(measurementPost, async () => {
    loads++
    return { prisma: db }
  })
  delete process.env.ESP32_AUTH_TOKEN
  assert.equal((await POST(esp32Request())).status, 503)
  process.env.ESP32_AUTH_TOKEN = "invalid token"
  assert.equal((await POST(esp32Request())).status, 503)
  process.env.ESP32_AUTH_TOKEN = token
  for (const header of [null, "Basic wrong", "Bearer wrong"]) {
    const request = esp32Request(header)
    assert.equal((await POST(request)).status, 401)
    assert.equal(request.bodyUsed, false)
  }
  for (const body of ["{", "{}", JSON.stringify({ ...payload, lat: 0 })]) {
    assert.equal((await POST(esp32Request(authorization, body))).status, 400)
  }
  assert.equal(loads, 0)
  assert.equal(db.transactions, 0)
  const valid = { ...payload, name: "Station", lat: 0, lon: -180 }
  const response = await POST(esp32Request(authorization, JSON.stringify(valid)))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    success: true, message: "Datos recibidos correctamente",
    station: { id: db.station.id, mac: payload.mac, name: "Station" },
  })
  assert.equal(loads, 1)
  assert.equal(db.transactions, 1)
  assert.equal(db.readings.length, 1)
  assert.equal(db.station.latitude, 0)
  assert.equal(db.station.longitude, -180)
  const snapshot = structuredClone({ station: db.station, readings: db.readings })
  db.failReading = true
  const logs = t.mock.method(console, "error", () => {})
  const failed = await POST(esp32Request(authorization, JSON.stringify({ ...valid, lat: 90 })))
  assert.equal(failed.status, 500)
  assert.deepEqual(await failed.json(), { error: "Error procesando datos" })
  assert.deepEqual({ station: db.station, readings: db.readings }, snapshot)
  assert.equal(loads, 2)
  assert.equal(db.transactions, 2)
  assert.deepEqual(logs.mock.calls.map(({ arguments: args }) => args), [["[measurement] Error procesando datos"]])
})
