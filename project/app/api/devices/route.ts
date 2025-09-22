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

    // Mark devices as offline if they haven't been seen in 60 seconds
    const now = new Date();
    const offlineThreshold = new Date(now.getTime() - 60 * 1000);

    const updatedDevices = await Promise.all(
      devices.map(async (device) => {
        if (device.lastSeen < offlineThreshold && device.status !== 'OFFLINE') {
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

    // Obtener la hora en Argentina (UTC-3)
    const nowArgentina = new Date(Date.now() - 3 * 60 * 60 * 1000);

    const device = await prisma.device.upsert({
      where: { mac },
      update: {
        name: name ?? undefined, // Actualiza el nombre si viene en el body
        version: version || undefined,
        status: status || undefined,
        lastSeen: nowArgentina,
      },
      create: {
        mac,
        name: name ?? null,
        version: version || null,
        status: status || 'OFFLINE',
        lastSeen: nowArgentina,
      },
    });

    return NextResponse.json(device);
  } catch (error) {
    console.error('Error creating/updating device:', error);
    return NextResponse.json({ error: 'Failed to create/update device' }, { status: 500 });
  }
}