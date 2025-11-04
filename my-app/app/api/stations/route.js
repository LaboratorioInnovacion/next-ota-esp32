import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

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
    const formattedStations = stations.map((station) => ({
      id: station.id,
      mac: station.mac,
      name: station.name,
      status: station.status,
      lastUpdate: station.updatedAt,
      temperature: station.readings[0]?.temperature || null,
      humidity: station.readings[0]?.humidity || null,
    }))

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
