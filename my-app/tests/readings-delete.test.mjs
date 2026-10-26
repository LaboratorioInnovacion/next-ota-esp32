import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { readingsDelete, readingsDeleteAuthorization } from "../lib/readings-delete-http.mjs"

// Synthetic weather credential deliberately outside the diagnostics-only format.
const token = "dummy-weather!@#$+/:=123"
const request = (authorization = `Bearer ${token}`) => new Request("https://example.invalid/api/readings/delete-all", {
  method: "DELETE", headers: authorization === null ? {} : { aUtHoRiZaTiOn: authorization }, body: "not JSON",
})

test("weather credential accepts printable punctuation and short values, without diagnostics restrictions", () => {
  for (const configured of [token, "short!", "x", "punctuation,;()[]{}"]) {
    assert.equal(readingsDeleteAuthorization(`Bearer ${configured}`, configured), 200)
  }
  assert.equal(readingsDeleteAuthorization(`bEaReR ${token}`, token), 200)
  for (const configured of [undefined, null, 123, "", " ", "two words", token + "\n", "\t", "é"]) {
    assert.equal(readingsDeleteAuthorization(`Bearer ${token}`, configured), 503)
  }
  for (const header of [null, "", token, `Basic ${token}`, "Bearer", "Bearer ", `Bearer  ${token}`,
    `Bearer\t${token}`, `Bearer ${token}\n`, `Bearer ${token}, Bearer ${token}`, "Bearer wrong",
    `Bearer ${token.slice(1)}`, `Bearer ${token}x`]) {
    assert.equal(readingsDeleteAuthorization(header, token), 401)
  }
})

test("configuration and authentication reject before any persistence access or body parsing", async () => {
  const forbidden = () => { assert.fail("Persistence must not be accessed") }
  for (const configured of [undefined, "", "has space", token + "\n"]) {
    const req = request()
    const response = await readingsDelete(forbidden, () => configured)(req)
    assert.equal(response.status, 503)
    assert.equal(req.bodyUsed, false)
    assert.equal(response.headers.get("cache-control"), "no-store")
  }
  for (const header of [null, "", "Bearer", "Bearer ", "Bearer wrong", `Basic ${token}`,
    `Bearer  ${token}`, `Bearer ${token}, Bearer ${token}`, "Bearer synthetic-diagnostics-token-only"]) {
    const req = request(header)
    const response = await readingsDelete(forbidden, () => token)(req)
    assert.equal(response.status, 401)
    assert.equal(req.bodyUsed, false)
    assert.deepEqual(await response.json(), { error: "Unauthorized" })
  }
})

test("authorized deletion calls deleteMany exactly once and preserves success contract, including zero", async () => {
  for (const count of [0, 7]) {
    const calls = []
    const handler = readingsDelete(async (args) => { calls.push(args); return { count } }, () => token)
    const req = request()
    const response = await handler(req)
    assert.equal(response.status, 200)
    assert.deepEqual(calls, [{}])
    assert.equal(req.bodyUsed, false)
    assert.deepEqual(await response.json(), { success: true, message: "Todas las lecturas han sido eliminadas", count })
  }
})

test("database failures return only the existing sanitized error without logging secrets", async (t) => {
  const logs = t.mock.method(console, "error", () => {})
  let calls = 0
  const response = await readingsDelete(async () => { calls++; throw new Error(`private DB detail ${token}`) }, () => token)(request())
  assert.equal(calls, 1)
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: "Error al eliminar las lecturas" })
  assert.equal(logs.mock.callCount(), 0)
})

test("route wiring uses server-only weather env and loads Prisma only after authorization", async (t) => {
  const previous = process.env.ESP32_AUTH_TOKEN
  t.after(() => {
    if (previous === undefined) delete process.env.ESP32_AUTH_TOKEN
    else process.env.ESP32_AUTH_TOKEN = previous
  })
  const source = await readFile(new URL("../app/api/readings/delete-all/route.js", import.meta.url), "utf8")
  assert.match(source, /export const runtime = "nodejs"/)
  assert.match(source, /import \{ readingsDelete \} from "@\/lib\/readings-delete-http\.mjs"/)
  assert.match(source, /await import\("@\/lib\/prisma"\)/)
  // Execute the actual route with only its import boundaries replaced; never load live Prisma.
  const executable = source
    .replace('import { readingsDelete } from "@/lib/readings-delete-http.mjs"', "")
    .replaceAll("export const ", "const ")
    .replace('import("@/lib/prisma")', "loadPrisma()")
  let loads = 0
  const calls = []
  const DELETE = new Function("readingsDelete", "loadPrisma", `${executable}\nreturn DELETE`)(readingsDelete, async () => {
    loads++
    return { prisma: { reading: { deleteMany: async (args) => { calls.push(args); return { count: 3 } } } } }
  })
  delete process.env.ESP32_AUTH_TOKEN
  assert.equal((await DELETE(request())).status, 503)
  process.env.ESP32_AUTH_TOKEN = "invalid token"
  assert.equal((await DELETE(request())).status, 503)
  process.env.ESP32_AUTH_TOKEN = token
  for (const header of [null, "Basic wrong", "Bearer wrong"]) assert.equal((await DELETE(request(header))).status, 401)
  assert.equal(loads, 0)
  assert.deepEqual(calls, [])
  assert.equal((await DELETE(request())).status, 200)
  assert.equal(loads, 1)
  assert.deepEqual(calls, [{}])
})
