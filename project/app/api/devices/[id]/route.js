import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Forzar renderizado dinámico para Vercel
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const device = await prisma.device.findUnique({
      where: { id: params.id },
      include: {
        debugLogs: {
          orderBy: { timestamp: 'desc' },
          take: 50,
        },
        measurements: {
          orderBy: { timestamp: 'desc' },
          take: 100,
        },
        _count: {
          select: {
            debugLogs: true,
            measurements: true,
          },
        },
      },
    });

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    return NextResponse.json(device);
  } catch (error) {
    console.error('Error fetching device:', error);
    return NextResponse.json({ error: 'Failed to fetch device' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    // Primero eliminar los logs y mediciones relacionados
    await prisma.debugLog.deleteMany({
      where: { deviceId: params.id },
    });

    await prisma.measurement.deleteMany({
      where: { deviceId: params.id },
    });

    // Luego eliminar el dispositivo
    const deletedDevice = await prisma.device.delete({
      where: { id: params.id },
    });

    return NextResponse.json({
      message: 'Device deleted successfully',
      device: deletedDevice,
    });
  } catch (error) {
    console.error('Error deleting device:', error);
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete device' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const body = await request.json();
    const { name, status, health } = body;

    const updatedDevice = await prisma.device.update({
      where: { id: params.id },
      data: {
        name: name || undefined,
        status: status || undefined,
        health: health || undefined,
      },
    });

    return NextResponse.json(updatedDevice);
  } catch (error) {
    console.error('Error updating device:', error);
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to update device' }, { status: 500 });
  }
}