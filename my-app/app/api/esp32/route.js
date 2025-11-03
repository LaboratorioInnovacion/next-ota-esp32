import { NextResponse } from "next/server"
import { mockDb } from "@/lib/mock-data"

// Endpoint para recibir datos de los ESP32
export async function POST(request) {
  try {
    const data = await request.json()
    const { mac, name, temperature, humidity, lat, lon } = data

    // Validar datos requeridos
    if (!mac || temperature === undefined || humidity === undefined) {
      return NextResponse.json({ error: "Faltan datos requeridos (mac, temperature, humidity)" }, { status: 400 })
    }

    // Buscar o crear estación
    let station = await mockDb.stations.findUnique({ where: { mac } })

    if (!station) {
      // Crear nueva estación
      station = await mockDb.stations.create({
        data: {
          mac,
          name: name || `ESP32_${mac.slice(-4)}`,
          status: "active",
          latitude: lat || null,
          longitude: lon || null,
        },
      })
    } else {
      // Actualizar estación existente
      station = await mockDb.stations.update({
        where: { id: station.id },
        data: {
          status: "active",
          ...(lat !== undefined && { latitude: lat }),
          ...(lon !== undefined && { longitude: lon }),
        },
      })
    }

    // Crear nueva lectura
    await mockDb.reading.create({
      data: {
        stationId: station.id,
        temperature,
        humidity,
      },
    })

    return NextResponse.json(
      {
        success: true,
        message: "Datos recibidos correctamente",
        station: {
          id: station.id,
          mac: station.mac,
          name: station.name,
        },
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("[v0] Error procesando datos ESP32:", error)
    return NextResponse.json({ error: "Error procesando datos" }, { status: 500 })
  }
}
