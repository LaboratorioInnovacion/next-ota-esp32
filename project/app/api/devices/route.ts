import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const devices = await prisma.device.findMany({
      orderBy: { lastSeen: 'desc' },
      include: {
        _count: {
          select: {
            debugLogs: true,
            measurements: true,
          },
        },
      },
    });

    // Mark devices as offline if they haven't been seen in 3 minutes
    const now = new Date();
    const offlineThreshold = new Date(now.getTime() - 3 * 60 * 1000); // 3 minutos

    const updatedDevices = await Promise.all(
      devices.map(async (device) => {
        const deviceLastSeen = new Date(device.lastSeen);
        if (deviceLastSeen < offlineThreshold && device.status !== 'OFFLINE') {
          console.log(`Marcando dispositivo ${device.name} como OFFLINE - Última vez visto: ${deviceLastSeen}, Threshold: ${offlineThreshold}`);
          const updated = await prisma.device.update({
            where: { id: device.id },
            data: { status: 'OFFLINE' },
            include: {
              _count: {
                select: {
                  debugLogs: true,
                  measurements: true,
                },
              },
            },
          });
          return updated;
        }
        return device;
      })
    );

    return NextResponse.json(updatedDevices);
  } catch (error) {
    console.error('Error fetching devices:', error);
    return NextResponse.json({ error: 'Failed to fetch devices' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mac, name, version, status, temperature, humidity } = body;

    // Validación según el esquema Device
    if (!mac || typeof mac !== 'string') {
      return NextResponse.json({ error: 'Valid MAC address is required' }, { status: 400 });
    }

    // Si vienen datos de sensores, redirigir al endpoint correcto
    if (temperature !== undefined || humidity !== undefined) {
      console.log(`⚠️ Datos de sensores recibidos en /api/devices, deberían ir a /api/weather`);
      console.log(`📊 Redirigiendo: temp=${temperature}, hum=${humidity}, mac=${mac}`);
      
      // Responder sugiriendo el endpoint correcto
      return NextResponse.json({
        warning: 'Sensor data should be sent to /api/weather endpoint',
        suggestedEndpoint: '/api/weather',
        receivedData: { temperature, humidity, mac }
      }, { status: 400 });
    }

    // Upsert del dispositivo según el esquema
    const device = await prisma.device.upsert({
      where: { mac },
      update: {
        name: name || undefined,
        version: version || undefined,
        status: (status as any) || 'ONLINE', // Cast para TypeScript con los enums
        lastSeen: new Date(),
        health: 'HEALTHY',
      },
      create: {
        mac,
        name: name || `ESP32_Device_${mac.slice(-5).replace(':', '')}`,
        version: version || null,
        status: (status as any) || 'ONLINE',
        lastSeen: new Date(),
        health: 'HEALTHY',
      },
    });

    // Los datos de sensores no se procesan aquí, solo gestión de dispositivos
    console.log(`✅ Dispositivo actualizado: ${device.name} (${device.mac}) - Status: ${device.status}`);

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

    return NextResponse.json({
      success: true,
      device: {
        id: device.id,
        mac: device.mac,
        name: device.name,
        status: device.status,
        version: device.version,
        lastSeen: device.lastSeen,
        health: device.health,
      },
      message: 'Device updated successfully. Use /api/weather for sensor data.'
    });

  } catch (error) {
    console.error('Error creating/updating device:', error);
    return NextResponse.json({ 
      error: 'Failed to create/update device',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}