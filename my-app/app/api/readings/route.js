import { NextResponse } from "next/server"
// import { prisma } from "@/lib/prisma" // Desactivado hasta configurar base de datos
import { mockDb } from "@/lib/mock-data" // Usando datos en memoria temporalmente

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const stationId = searchParams.get("stationId")
    const period = searchParams.get("period") || "week" // week, month

    if (!stationId) {
      return NextResponse.json({ error: "stationId requerido" }, { status: 400 })
    }

    // Calcular fecha de inicio según el período
    const now = new Date()
    const startDate = new Date()

    if (period === "week") {
      startDate.setDate(now.getDate() - 7)
    } else if (period === "month") {
      startDate.setDate(now.getDate() - 30)
    }

    const readings = await mockDb.reading.findMany({
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
