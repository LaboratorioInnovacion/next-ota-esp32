import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mac, name, temperature, humidity } = body;

    // Validar datos requeridos
    if (!mac) {
      return NextResponse.json({ error: 'MAC address is required' }, { status: 400 });
    }

    if (temperature === undefined && humidity === undefined) {
      return NextResponse.json({ error: 'At least one measurement (temperature or humidity) is required' }, { status: 400 });
    }

    // Crear o actualizar el dispositivo
    const device = await prisma.device.upsert({
      where: { mac },
      update: {
        name: name ?? undefined,
        status: 'ONLINE',
        lastSeen: new Date(),
        health: 'HEALTHY',
      },
      create: {
        mac,
        name: name ?? `ESP32_${mac.replace(/:/g, '')}`,
        status: 'ONLINE',
        lastSeen: new Date(),
        health: 'HEALTHY',
      },
    });

    // Preparar las mediciones a guardar
    const measurements = [];

    if (temperature !== undefined) {
      measurements.push({
        deviceId: device.id,
        type: 'temperature',
        value: parseFloat(temperature),
        unit: '°C',
      });
    }

    if (humidity !== undefined) {
      measurements.push({
        deviceId: device.id,
        type: 'humidity',
        value: parseFloat(humidity),
        unit: '%',
      });
    }

    // Guardar todas las mediciones
    const savedMeasurements = await prisma.measurement.createMany({
      data: measurements,
    });

    // Respuesta exitosa
    return NextResponse.json({
      success: true,
      device: {
        id: device.id,
        mac: device.mac,
        name: device.name,
        status: device.status,
      },
      measurementsSaved: savedMeasurements.count,
      data: {
        temperature: temperature ? { value: temperature, unit: '°C' } : null,
        humidity: humidity ? { value: humidity, unit: '%' } : null,
      },
    });

  } catch (error) {
    console.error('Error processing weather data:', error);
    return NextResponse.json({ 
      error: 'Failed to process weather data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET endpoint para obtener los últimos datos meteorológicos
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mac = searchParams.get('mac');
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const where: any = {};
    if (mac) {
      // Buscar el dispositivo por MAC para obtener su ID
      const device = await prisma.device.findUnique({
        where: { mac },
        select: { id: true }
      });
      
      if (!device) {
        return NextResponse.json({ error: 'Device not found' }, { status: 404 });
      }
      
      where.deviceId = device.id;
    }

    // Filtrar solo mediciones meteorológicas
    where.type = { in: ['temperature', 'humidity'] };

    const measurements = await prisma.measurement.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: {
        device: {
          select: { mac: true, name: true, status: true }
        }
      }
    });

    // Agrupar por dispositivo y timestamp para una respuesta más organizada
    const groupedData = measurements.reduce((acc: any, measurement) => {
      const key = `${measurement.device.mac}_${measurement.timestamp.getTime()}`;
      
      if (!acc[key]) {
        acc[key] = {
          device: measurement.device,
          timestamp: measurement.timestamp,
          data: {}
        };
      }
      
      acc[key].data[measurement.type] = {
        value: measurement.value,
        unit: measurement.unit
      };
      
      return acc;
    }, {});

    const formattedData = Object.values(groupedData);

    return NextResponse.json({
      count: formattedData.length,
      data: formattedData
    });

  } catch (error) {
    console.error('Error fetching weather data:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch weather data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}