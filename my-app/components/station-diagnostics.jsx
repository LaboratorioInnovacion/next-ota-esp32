"use client"

import { formatArgentina } from "@/lib/station-time.mjs"

export function StationDiagnostics({ station }) {
  return (
    <div className="space-y-1 text-xs text-muted-foreground" role="status">
      <p>{station.reason ?? "Estado desconocido"}</p>
      <p>Última señal: {formatArgentina(station.lastSeenAt)}</p>
      <p>Última medición recibida: {formatArgentina(station.lastValidReadingAt)}</p>
      {station.sensorStatus === "error" && <p>Sensor: DHT_INVALID_SAMPLE</p>}
      {station.firmwareVersion && <p>Firmware: {station.firmwareVersion}</p>}
    </div>
  )
}
