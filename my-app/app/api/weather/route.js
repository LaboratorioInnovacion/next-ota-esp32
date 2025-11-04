import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request) {
  try {
    const data = await request.json()

    if (!data.mac || !data.name || data.temperature === undefined || data.humidity === undefined) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 })
    }

    let station = await prisma.station.findUnique({
      where: { mac: data.mac },
    })

    if (!station) {
      station = await prisma.station.create({
        data: {
          mac: data.mac,
          name: data.name,
          status: "online",
        },
      })
    } else {
      // Actualizar última vez vista
      await prisma.station.update({
        where: { id: station.id },
        data: {
          status: "online",
          updatedAt: new Date(),
        },
      })
    }

    const reading = await prisma.reading.create({
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

    let whereClause = {}
    
    // Filtrar por MAC si se proporciona
    if (mac) {
      const station = await prisma.station.findUnique({ where: { mac } })
      if (station) {
        whereClause.stationId = station.id
      } else {
        // Si no se encuentra la estación, devolver array vacío
        return NextResponse.json({
          success: true,
          count: 0,
          data: [],
        })
      }
    }

    const readings = await prisma.reading.findMany({
      where: whereClause,
      include: {
        station: true,
      },
      orderBy: {
        timestamp: "desc",
      },
      take: limit,
    })

    const readingsWithStation = readings.map(reading => ({
      ...reading,
      station: reading.station,
    }))

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
