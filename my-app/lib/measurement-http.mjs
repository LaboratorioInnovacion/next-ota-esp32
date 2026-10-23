import { ingestReading } from "./ingest-reading.mjs"
import { MeasurementError, readMeasurement } from "./measurement.mjs"

// Both legacy routes intentionally accept requests without Authorization.
export function measurementPost(prisma, route) {
  return async function POST(request) {
    try {
      const data = await readMeasurement(request)
      if (route === "weather" && !data.name) {
        throw new MeasurementError("Datos incompletos")
      }
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
