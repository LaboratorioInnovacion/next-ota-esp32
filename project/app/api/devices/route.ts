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

    // Mark devices as offline if they haven't been seen in 2 minutes
    // Ajustamos el threshold considerando que la base de datos guarda en horario argentino
    const now = new Date();
    const argentinaTime = new Date(now.getTime() - 3 * 60 * 60 * 1000); // Convertir a Argentina
    const offlineThreshold = new Date(argentinaTime.getTime() - 2 * 60 * 1000); // 2 minutos

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
    const { mac, name, version, status } = body;

    if (!mac) {
      return NextResponse.json({ error: 'MAC address is required' }, { status: 400 });
    }

    const device = await prisma.device.upsert({
      where: { mac },
      update: {
        name: name ?? undefined, // Actualiza el nombre si viene en el body
        version: version || undefined,
        status: status || undefined,
        lastSeen: new Date(),
      },
      create: {
        mac,
        name: name ?? null,
        version: version || null,
        status: status || 'OFFLINE',
        lastSeen: new Date(),
      },
    });

    return NextResponse.json(device);
  } catch (error) {
    console.error('Error creating/updating device:', error);
    return NextResponse.json({ error: 'Failed to create/update device' }, { status: 500 });
  }
}