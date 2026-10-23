import test from "node:test"
import assert from "node:assert/strict"
import { startVisiblePolling, REFRESH_INTERVAL_MS } from "../lib/visible-polling.mjs"

const flush = () => new Promise((resolve) => setImmediate(resolve))
function environment(hidden = false) {
  const document = new EventTarget()
  document.hidden = hidden
  const timers = new Map()
  let next = 0
  return {
    document, timers,
    setTimeout(fn, delay) { timers.set(++next, { fn, delay }); return next },
    clearTimeout(id) { timers.delete(id) },
    onError(error) { throw error },
    visibility(hidden) { document.hidden = hidden; document.dispatchEvent(new Event("visibilitychange")) },
  }
}

test("60-second polling never overlaps; manual refresh replaces scheduled poll", async () => {
  const env = environment()
  let resolve
  let calls = 0
  const polling = startVisiblePolling(() => { calls++; return new Promise((done) => { resolve = done }) }, env)
  assert.equal(calls, 1)
  await polling.refresh()
  assert.equal(calls, 1)
  resolve()
  await flush()
  assert.equal(env.timers.size, 1)
  assert.equal([...env.timers.values()][0].delay, REFRESH_INTERVAL_MS)
  const manual = polling.refresh()
  assert.equal(calls, 2)
  assert.equal(env.timers.size, 0)
  resolve()
  await manual
  polling.stop()
  assert.equal(env.timers.size, 0)
})

test("hidden tabs pause and abort; becoming visible resumes immediately", async () => {
  const env = environment(true)
  const signals = []
  const polling = startVisiblePolling(async (signal) => {
    signals.push(signal)
    await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }))
  }, env)
  assert.equal(signals.length, 0)
  env.visibility(false)
  assert.equal(signals.length, 1)
  env.visibility(true)
  assert.equal(signals[0].aborted, true)
  env.visibility(false)
  await flush()
  assert.equal(signals.length, 2)
  polling.stop()
  await flush()
  assert.equal(signals[1].aborted, true)
  assert.equal(env.timers.size, 0)
  env.visibility(false)
  assert.equal(signals.length, 2)
})

test("teardown aborts pending work and never schedules another request", async () => {
  const env = environment()
  let signal
  const polling = startVisiblePolling(async (value) => {
    signal = value
    await new Promise((resolve) => value.addEventListener("abort", resolve))
  }, env)
  polling.stop()
  await flush()
  assert.equal(signal.aborted, true)
  assert.equal(env.timers.size, 0)
  await polling.refresh()
  assert.equal(env.timers.size, 0)
})
