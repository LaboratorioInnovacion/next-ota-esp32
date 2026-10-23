// A conservative UI cadence; the deployed firmware's reporting interval is unknown.
export const REFRESH_INTERVAL_MS = 60_000

export function startVisiblePolling(task, { document, setTimeout, clearTimeout, onError = console.error }) {
  let stopped = false
  let timer
  let controller
  let running = false
  const run = async () => {
    if (stopped || document.hidden || running) return
    clearTimeout(timer)
    running = true
    controller = new AbortController()
    try {
      await task(controller.signal)
    } catch (error) {
      if (error.name !== "AbortError") onError(error)
    } finally {
      running = false
      if (!stopped && !document.hidden) {
        if (controller.signal.aborted) void run()
        else timer = setTimeout(run, REFRESH_INTERVAL_MS)
      }
    }
  }
  const onVisibility = () => {
    clearTimeout(timer)
    if (document.hidden) controller?.abort()
    else void run()
  }
  document.addEventListener("visibilitychange", onVisibility)
  void run()
  return {
    refresh: run,
    stop() {
      stopped = true
      clearTimeout(timer)
      controller?.abort()
      document.removeEventListener("visibilitychange", onVisibility)
    },
  }
}
