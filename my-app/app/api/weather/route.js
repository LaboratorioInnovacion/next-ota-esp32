import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { measurementPost } from "@/lib/measurement-http.mjs"

export const POST = measurementPost(prisma, "weather")

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
