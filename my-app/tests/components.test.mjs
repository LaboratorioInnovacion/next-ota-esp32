import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import ts from "typescript"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import * as time from "../lib/station-time.mjs"
import * as stationData from "../lib/station-data.mjs"
import * as polling from "../lib/visible-polling.mjs"

const require = createRequire(import.meta.url)
const flush = () => new Promise((resolve) => setImmediate(resolve))

// Execute the actual source with narrow browser/React doubles; never load Prisma or an API.
function load(relativePath, mocks, globals = {}) {
  const source = fs.readFileSync(new URL(relativePath, import.meta.url), "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
  const module = { exports: {} }
  new Function("require", "module", "exports", ...Object.keys(globals), compiled)(
    (id) => id in mocks ? mocks[id] : require(id), module, module.exports, ...Object.values(globals),
  )
  return module.exports
}

function hooks() {
  const slots = []
  let cursor = 0
  let effects = []
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
  const api = {
    useState(initial) {
      const index = cursor++
      slots[index] ??= { value: typeof initial === "function" ? initial() : initial }
      return [slots[index].value, (value) => { slots[index].value = typeof value === "function" ? value(slots[index].value) : value }]
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial } },
    useEffect(effect, deps) {
      const index = cursor++
      if (!same(slots[index]?.deps, deps)) effects.push(() => {
        slots[index]?.cleanup?.()
        slots[index] = { deps, cleanup: effect() }
      })
    },
    useMemo(factory, deps) {
      const index = cursor++
      if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() }
      return slots[index].value
    },
    useCallback(callback, deps) { return api.useMemo(() => callback, deps) },
  }
  return {
    api,
    render(component, props) {
      cursor = 0
      const result = component(props)
      const pending = effects
      effects = []
      pending.forEach((effect) => effect())
      return result
    },
    stop() { slots.forEach((slot) => slot?.cleanup?.()) },
  }
}

test("freshness renders a persistent exact ISO time with Argentina timezone", () => {
  const { ReadingFreshness } = load("../components/reading-freshness.jsx", { "@/lib/station-time.mjs": time })
  const html = renderToStaticMarkup(React.createElement(ReadingFreshness, { value: "2026-10-23T03:00:00Z" }))
  assert.match(html, /<time dateTime="2026-10-23T03:00:00.000Z">23\/10\/2026.*00:00:00.*GMT-3.*Argentina/)
})

test("map initializes once, retains markers and viewport through unchanged polls", async () => {
  const harness = hooks()
  const document = { getElementById: () => ({}), createElement: () => ({ append() {} }) }
  const calls = { maps: 0, markers: 0, fit: 0, popup: 0, remove: 0 }
  const map = { fitBounds() { calls.fit++ }, remove() { calls.remove++ } }
  const L = {
    map() { calls.maps++; return map },
    tileLayer: () => ({ addTo() {} }),
    marker() {
      calls.markers++
      return { on() {}, setLatLng() {}, setIcon() {}, bindPopup() { calls.popup++; return this }, addTo() {}, remove() {} }
    },
    divIcon: (value) => value,
    latLngBounds: () => ({ pad() { return this } }),
  }
  const router = { push() {} }
  const { StationsMap } = load("../components/stations-map.jsx", {
    react: harness.api, "next/navigation": { useRouter: () => router },
    "@/components/ui/card": {}, "lucide-react": {}, leaflet: { __esModule: true, default: L },
  }, { document })
  // The map's DOM ref is assigned by the renderer before effects commit.
  const originalRef = harness.api.useRef
  harness.api.useRef = (initial) => {
    const ref = originalRef(initial)
    if (initial === null && !ref.current) ref.current = {}
    return ref
  }
  const stations = [{ id: "a", name: "A", latitude: 0, longitude: 0, temperature: 0 }]
  harness.render(StationsMap, { stations })
  await flush()
  harness.render(StationsMap, { stations })
  harness.render(StationsMap, { stations: stationData.reconcileStations(stations, structuredClone(stations)) })
  harness.render(StationsMap, { stations: [{ ...stations[0], temperature: 2 }] })
  assert.deepEqual(calls, { maps: 1, markers: 1, fit: 1, popup: 2, remove: 0 })
  harness.stop()
  assert.equal(calls.remove, 1)
})

test("history requests depend on id/period/latest reading, reject stale responses, and abort on teardown", async () => {
  const harness = hooks()
  const document = new EventTarget()
  document.hidden = false
  const requests = []
  const fetch = (url, options) => new Promise((resolve) => { requests.push({ url, signal: options.signal, resolve }) })
  const { useStationHistory } = load("../lib/use-station-data.js", {
    react: harness.api, "./station-data.mjs": stationData, "./station-time.mjs": time, "./visible-polling.mjs": polling,
  }, { document, fetch })
  const render = (props) => harness.render(({ id, period, timestamp }) => useStationHistory(id, period, timestamp), props)
  const props = { id: "b", period: "week", timestamp: "2026-10-23T03:00:00Z" }
  render(props)
  render({ ...props })
  assert.equal(requests.length, 1)
  render({ ...props, period: "month" })
  assert.equal(requests.length, 2)
  assert.equal(requests[0].signal.aborted, true)
  requests[0].resolve({ ok: true, json: async () => ({ success: true, data: [{ timestamp: props.timestamp, temperature: 999 }] }) })
  requests[1].resolve({ ok: true, json: async () => ({ success: true, data: [{ timestamp: props.timestamp, temperature: 0 }] }) })
  await flush()
  const result = render({ ...props, period: "month" })
  assert.equal(result.data[0].temperature, 0)
  render({ ...props, period: "month", timestamp: "2026-10-23T04:00:00Z" })
  assert.equal(requests.length, 3)
  harness.stop()
  assert.equal(requests[2].signal.aborted, true)
})

test("iframe HTML remains stable for reading changes but updates when coordinates change", () => {
  const harness = hooks()
  const { SingleStationMapFallback } = load("../components/single-station-map-fallback.jsx", {
    react: harness.api, "@/components/ui/card": {}, "lucide-react": {},
  })
  const station = { id: "a", name: "A", latitude: 0, longitude: 0, temperature: 1 }
  const html = (tree) => tree.props.children[1].props.srcDoc
  harness.render(SingleStationMapFallback, { station })
  const first = html(harness.render(SingleStationMapFallback, { station }))
  const unchanged = html(harness.render(SingleStationMapFallback, { station: { ...station, temperature: 2 } }))
  assert.equal(unchanged, first)
  assert.match(first, /setView\(\[0, 0\]/)
  harness.render(SingleStationMapFallback, { station: { ...station, latitude: 1 } })
  const moved = html(harness.render(SingleStationMapFallback, { station: { ...station, latitude: 1 } }))
  assert.notEqual(moved, first)
  harness.stop()
})

test("Prisma initialization preserves the connection URL and reuses the development singleton", () => {
  const calls = { adapters: [], clients: [] }
  const mocks = {
    "@prisma/adapter-pg": { PrismaPg: class { constructor(config) { calls.adapters.push(config); this.config = config } } },
    "@prisma/client": { PrismaClient: class { constructor(options) { calls.clients.push(options) } } },
  }
  const globals = {
    globalThis: {},
    process: { env: { NODE_ENV: "development", DATABASE_URL: "postgresql://example.invalid/synthetic" } },
  }
  const first = load("../lib/prisma.js", mocks, globals)
  const second = load("../lib/prisma.js", mocks, globals)
  assert.equal(first.prisma, second.prisma)
  assert.equal(calls.adapters.length, 1)
  assert.equal(calls.clients.length, 1)
  assert.equal(calls.adapters[0].connectionString, globals.process.env.DATABASE_URL)
  assert.deepEqual(Object.keys(calls.clients[0]), ["adapter"])
})

test("Prisma initialization fails explicitly when DATABASE_URL is missing", () => {
  let adapters = 0
  assert.throws(() => load("../lib/prisma.js", {
    "@prisma/adapter-pg": { PrismaPg: class { constructor() { adapters++ } } },
    "@prisma/client": { PrismaClient: class {} },
  }, { globalThis: {}, process: { env: {} } }), /DATABASE_URL is required/)
  assert.equal(adapters, 0)
})
