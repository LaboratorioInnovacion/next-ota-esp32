import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { stationWithLatestReading } from "@/lib/station-data.mjs"

export async function GET() {
  try {
    const stations = await prisma.station.findMany({
      include: {
        readings: {
          orderBy: {
            timestamp: "desc",
          },
          take: 1,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    })

    // Formatear datos con última lectura
    const formattedStations = stations.map(stationWithLatestReading)

    return NextResponse.json(
      {
        success: true,
        data: formattedStations,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("[v0] Error obteniendo estaciones:", error)
    return NextResponse.json({ error: "Error obteniendo estaciones" }, { status: 500 })
  }
}
