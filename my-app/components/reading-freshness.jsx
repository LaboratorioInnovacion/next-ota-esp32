"use client"

import { useSyncExternalStore } from "react"
import { formatArgentina, parseInstant, relativeFreshness } from "@/lib/station-time.mjs"

const listeners = new Set()
let timer
let now = Date.now()
function subscribe(listener) {
  listeners.add(listener)
  if (!timer) {
    now = Date.now()
    timer = setInterval(() => {
      now = Date.now()
      listeners.forEach((notify) => notify())
    }, 60_000)
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      clearInterval(timer)
      timer = undefined
    }
  }
}
const getSnapshot = () => now
const getServerSnapshot = () => null

export function ReadingFreshness({ value }) {
  const currentTime = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const date = parseInstant(value)
  return (
    <span className="inline-flex flex-col gap-1">
      <span>{currentTime == null ? "Última lectura recibida" : relativeFreshness(value, currentTime)}</span>
      {date ? <time dateTime={date.toISOString()}>{formatArgentina(date)}</time> : <span>Sin lecturas</span>}
    </span>
  )
}
