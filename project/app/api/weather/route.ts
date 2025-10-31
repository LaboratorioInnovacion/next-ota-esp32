import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Forzar renderizado dinámico para Vercel
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mac, name, version, temperature, humidity } = body;

    // Validar datos requeridos
    if (!mac || typeof mac !== 'string') {
      return NextResponse.json({ error: 'Valid MAC address is required' }, { status: 400 });
    }

    if (temperature === undefined && humidity === undefined) {
      return NextResponse.json({ error: 'At least one measurement (temperature or humidity) is required' }, { status: 400 });
    }

    // Log de datos recibidos para debugging
    console.log(`📡 Datos ESP32 recibidos: MAC=${mac}, T=${temperature}°C, H=${humidity}%, Version=${version}`);

    // Crear o actualizar el dispositivo según el esquema
    const device = await prisma.device.upsert({
      where: { mac },
      update: {
        name: name || undefined,
        version: version || undefined,
        status: 'ONLINE',
        lastSeen: new Date(),
        health: 'HEALTHY',
      },
      create: {
        mac,
        name: name || `ESP32_Meteo_${mac.slice(-5).replace(':', '')}`,
        version: version || null,
        status: 'ONLINE',
        lastSeen: new Date(),
        health: 'HEALTHY',
      },
    });

    // Preparar las mediciones a guardar según el esquema Measurement
    const measurements = [];

    if (temperature !== undefined && !isNaN(parseFloat(temperature))) {
      measurements.push({
        deviceId: device.id,
        type: 'temperature',
        value: parseFloat(temperature),
        unit: '°C',
        timestamp: new Date(), // Explícitamente según el esquema
      });
    }

    if (humidity !== undefined && !isNaN(parseFloat(humidity))) {
      measurements.push({
        deviceId: device.id,
        type: 'humidity',
        value: parseFloat(humidity),
        unit: '%',
        timestamp: new Date(),
      });
    }

    // Guardar todas las mediciones en la tabla measurements
    let savedMeasurements = { count: 0 };
    if (measurements.length > 0) {
      savedMeasurements = await prisma.measurement.createMany({
        data: measurements,
      });
      console.log(`💾 Mediciones guardadas: ${savedMeasurements.count}`);
    }

    // Emitir evento de Socket.IO para actualizaciones en tiempo real
    try {
      await import('@/lib/socket-init'); // Asegurar que Socket.IO esté inicializado
      const { emitDeviceUpdate } = await import('@/lib/socket-server');
      emitDeviceUpdate({
        id: device.id,
        mac: device.mac,
        name: device.name,
        status: device.status,
        version: device.version,
        lastSeen: device.lastSeen,
        health: device.health,
      });
    } catch (error) {
      console.log('Socket.IO not available:', error);
    }

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
    const groupedData = measurements.reduce((acc: any, measurement: any) => {
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