"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { reconcileStations } from "./station-data.mjs"
import { formatArgentina } from "./station-time.mjs"
import { startVisiblePolling } from "./visible-polling.mjs"

export function useStations() {
  const [stations, setStations] = useState([])
  const [loading, setLoading] = useState(true)
  const polling = useRef(null)
  useEffect(() => {
    polling.current = startVisiblePolling(async (signal) => {
      try {
        const response = await fetch("/api/stations", { signal, cache: "no-store" })
        if (!response.ok) throw new Error("Station request failed")
        const result = await response.json()
        if (!signal.aborted && result.success) setStations((previous) => reconcileStations(previous, result.data))
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    }, { document, setTimeout, clearTimeout })
    return () => polling.current.stop()
  }, [])
  const refresh = useCallback(() => polling.current?.refresh(), [])
  return { stations, loading, refresh }
}

export function useStationHistory(stationId, period, lastUpdate, revision = 0) {
  const key = `${stationId}:${period}`
  const [history, setHistory] = useState({ key: null, data: [] })
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!stationId) return
    let controller
    let disposed = false
    let started = false
    const load = async () => {
      if (disposed || document.hidden || started) return
      started = true
      controller = new AbortController()
      const signal = controller.signal
      setLoading(true)
      try {
        const response = await fetch(`/api/readings?stationId=${encodeURIComponent(stationId)}&period=${period}`, {
          signal, cache: "no-store",
        })
        if (!response.ok) throw new Error("History request failed")
        const result = await response.json()
        if (!signal.aborted && result.success) {
          const next = result.data.map((reading) => ({ ...reading, time: formatArgentina(reading.timestamp) }))
          setHistory((previous) => previous.key === key && JSON.stringify(previous.data) === JSON.stringify(next) ? previous : { key, data: next })
        }
      } catch (error) {
        if (error.name !== "AbortError") console.error(error)
      } finally {
        if (!signal.aborted) setLoading(false)
        else {
          started = false
          if (!disposed && !document.hidden) void load()
        }
      }
    }
    const onVisibility = () => {
      if (document.hidden) controller?.abort()
      else void load()
    }
    void load()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      disposed = true
      controller?.abort()
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [stationId, period, lastUpdate, revision, key])
  return { data: history.key === key ? history.data : [], loading }
}
