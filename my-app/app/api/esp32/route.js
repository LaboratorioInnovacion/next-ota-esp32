import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

    // Buscar o crear estación
    let station = await prisma.station.findUnique({ where: { mac } });

    if (!station) {
      // Crear nueva estación
      station = await prisma.station.create({
        data: {
          mac,
          name: name || `ESP32_${mac.slice(-4)}`,
          status: "online",
          // latitude: lat || null,
          // longitude: lon || null,
        },
      });
    } else {
      // Actualizar estación existente
      station = await prisma.station.update({
        where: { id: station.id },
        data: {
          status: "online",
          updatedAt: new Date(),
          // ...(lat !== undefined && { latitude: lat }),
          // ...(lon !== undefined && { longitude: lon }),
        },
      });
    }

    // Crear nueva lectura
    await prisma.reading.create({
      data: {
        stationId: station.id,
        temperature,
        humidity,
      },
    });

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
