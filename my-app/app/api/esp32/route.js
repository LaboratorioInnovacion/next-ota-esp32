import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ingestReading } from "@/lib/ingest-reading.mjs";

// Endpoint para recibir datos de los ESP32
export async function POST(request) {
  try {
    const data = await request.json();
    // const { mac, name, temperature, humidity, lat, lon } = data
    const { mac, name, temperature, humidity } = data;

    // Validar datos requeridos
    if (!mac || temperature === undefined || humidity === undefined) {
      return NextResponse.json(
        { error: "Faltan datos requeridos (mac, temperature, humidity)" },
        { status: 400 }
      );
    }

    const { station } = await ingestReading(prisma, { mac, name, temperature, humidity });

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
      { status: 200 }
    );
  } catch (error) {
    console.error("[v0] Error procesando datos ESP32:", error);
    return NextResponse.json(
      { error: "Error procesando datos" },
      { status: 500 }
    );
  }
}
