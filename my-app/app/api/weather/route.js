import { NextResponse } from "next/server"
// import { prisma } from "@/lib/prisma" // Desactivado hasta configurar base de datos
import { mockDb } from "@/lib/mock-data" // Usando datos en memoria temporalmente

export async function POST(request) {
  try {
    const data = await request.json()

    if (!data.mac || !data.name || data.temperature === undefined || data.humidity === undefined) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 })
    }

    let station = await mockDb.stations.findUnique({
      where: { mac: data.mac },
    })

    if (!station) {
      station = await mockDb.stations.create({
        data: {
          mac: data.mac,
          name: data.name,
          status: "online",
        },
      })
    } else {
      // Actualizar última vez vista
      await mockDb.stations.update({
        where: { id: station.id },
        data: {
          status: "online",
          updatedAt: new Date(),
        },
      })
    }

    const reading = await mockDb.reading.create({
      data: {
        stationId: station.id,
        temperature: data.temperature,
        humidity: data.humidity,
        timestamp: new Date(),
      },
    })

    console.log("[v0] Datos meteorológicos guardados:", reading)

    return NextResponse.json(
      {
        success: true,
        message: "Datos recibidos y guardados correctamente",
        data: reading,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("[v0] Error procesando datos:", error)
    return NextResponse.json({ error: "Error procesando datos" }, { status: 500 })
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const mac = searchParams.get("mac")
    const limit = Number.parseInt(searchParams.get("limit") || "100")

    let readings = await mockDb.reading.findMany({
      orderBy: {
        timestamp: "desc",
      },
    })

    // Filtrar por MAC si se proporciona
    if (mac) {
      const station = await mockDb.stations.findUnique({ where: { mac } })
      if (station) {
        readings = readings.filter((r) => r.stationId === station.id)
      } else {
        readings = []
      }
    }

    // Agregar información de la estación a cada lectura
    const readingsWithStation = await Promise.all(
      readings.slice(0, limit).map(async (reading) => {
        const stations = await mockDb.stations.findMany()
        const station = stations.find((s) => s.id === reading.stationId)
        return {
          ...reading,
          station,
        }
      }),
    )

    return NextResponse.json(
      {
        success: true,
        count: readingsWithStation.length,
        data: readingsWithStation.reverse(),
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("[v0] Error obteniendo datos:", error)
    return NextResponse.json({ error: "Error obteniendo datos" }, { status: 500 })
  }
}
