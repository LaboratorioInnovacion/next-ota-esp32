import { NextRequest, NextResponse } from 'next/server';
import { mqttManager } from '@/lib/mqtt-client';
import { prisma } from '@/lib/prisma';

// Forzar renderizado dinámico para Vercel
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { firmwareId, deviceId } = body;

    if (!firmwareId) {
      return NextResponse.json({ error: 'Firmware ID is required' }, { status: 400 });
    }

    const firmware = await prisma.firmware.findUnique({
      where: { id: firmwareId },
    });

    if (!firmware) {
      return NextResponse.json({ error: 'Firmware not found' }, { status: 404 });
    }

    let targetDevice = null;
    if (deviceId) {
      targetDevice = await prisma.device.findUnique({
        where: { id: deviceId },
      });
      if (!targetDevice) {
        return NextResponse.json({ error: 'Device not found' }, { status: 404 });
      }
    }

    // Construct firmware URL
    const firmwareUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}${firmware.filePath}`;

    // Send OTA update via MQTT
    await mqttManager.publishOTAUpdate(
      targetDevice?.mac || null,
      firmwareUrl,
      firmware.version
    );

    // Update device status to UPDATING
    if (targetDevice) {
      await prisma.device.update({
        where: { id: targetDevice.id },
        data: { status: 'UPDATING' },
      });
    } else {
      // Update all online devices to UPDATING status
      await prisma.device.updateMany({
        where: { status: 'ONLINE' },
        data: { status: 'UPDATING' },
      });
    }

    return NextResponse.json({
      message: 'OTA update initiated successfully',
      targetDevice: targetDevice?.name || 'All devices',
      firmware: firmware.filename,
      version: firmware.version,
    });
  } catch (error) {
    console.error('Error deploying firmware:', error);
    return NextResponse.json({ error: 'Failed to deploy firmware' }, { status: 500 });
  }
}