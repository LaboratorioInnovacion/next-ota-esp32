import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { rollingStart } from "@/lib/station-time.mjs"

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const stationId = searchParams.get("stationId")
    const period = searchParams.get("period") || "week" // week, month

    if (!stationId) {
      return NextResponse.json({ error: "stationId requerido" }, { status: 400 })
    }

    const startDate = rollingStart(period)

    const readings = await prisma.reading.findMany({
      where: {
        stationId,
        timestamp: {
          gte: startDate,
        },
      },
      orderBy: {
        timestamp: "asc",
      },
    })

    return NextResponse.json(
      {
        success: true,
        count: readings.length,
        data: readings,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("[v0] Error obteniendo lecturas:", error)
    return NextResponse.json({ error: "Error obteniendo lecturas" }, { status: 500 })
  }
}
