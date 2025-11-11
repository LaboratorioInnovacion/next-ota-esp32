import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Endpoint para eliminar todas las lecturas
export async function DELETE(request) {
  try {
    const result = await prisma.reading.deleteMany({})

    return NextResponse.json(
      {
        success: true,
        message: "Todas las lecturas han sido eliminadas",
        count: result.count,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("Error eliminando lecturas:", error)
    return NextResponse.json({ error: "Error al eliminar las lecturas" }, { status: 500 })
  }
}
