import { ingestReading } from "./ingest-reading.mjs"
import { MeasurementError, readMeasurement } from "./measurement.mjs"
import { weatherAuthorization } from "./weather-authorization.mjs"

// Only ESP32 ingestion is protected; the legacy weather route stays unchanged.
export function measurementPost(persistence, route, token = () => process.env.ESP32_AUTH_TOKEN) {
  return async function POST(request) {
    if (route === "esp32") {
      const auth = weatherAuthorization(request.headers.get("authorization"), token())
      if (auth !== 200) return Response.json({
        error: auth === 503 ? "Measurement ingestion is not configured" : "Unauthorized",
      }, { status: auth, headers: { "Cache-Control": "no-store" } })
    }
    try {
      const data = await readMeasurement(request)
      if (route === "weather" && !data.name) {
        throw new MeasurementError("Datos incompletos")
      }
      const prisma = typeof persistence === "function" ? await persistence() : persistence
      const { station, reading } = await ingestReading(prisma, data)
      return Response.json(route === "weather" ? {
        success: true,
        message: "Datos recibidos y guardados correctamente",
        data: reading,
      } : {
        success: true,
        message: "Datos recibidos correctamente",
        station: { id: station.id, mac: station.mac, name: station.name },
      }, { status: 200 })
    } catch (error) {
      if (error instanceof MeasurementError) {
        return Response.json({ error: error.message }, { status: 400 })
      }
      console.error("[measurement] Error procesando datos")
      return Response.json({ error: "Error procesando datos" }, { status: 500 })
    }
  }
}
