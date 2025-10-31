import { NextResponse } from 'next/server';
import { mqttManager } from '@/lib/mqtt-client';
import { prisma } from '@/lib/prisma';

// Forzar renderizado dinámico para Vercel
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const { firmwareId, deviceIds } = body;

    if (!firmwareId) {
      return NextResponse.json({ error: 'Firmware ID is required' }, { status: 400 });
    }

    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      return NextResponse.json({ error: 'At least one device ID is required' }, { status: 400 });
    }

    // Obtener información del firmware
    const firmware = await prisma.firmware.findUnique({
      where: { id: firmwareId },
    });

    if (!firmware) {
      return NextResponse.json({ error: 'Firmware not found' }, { status: 404 });
    }

    // Obtener dispositivos
    const devices = await prisma.device.findMany({
      where: {
        id: { in: deviceIds },
      },
    });

    if (devices.length === 0) {
      return NextResponse.json({ error: 'No valid devices found' }, { status: 404 });
    }

    // Enviar comando OTA via MQTT a cada dispositivo
    const deploymentResults = [];
    
    for (const device of devices) {
      try {
        const otaMessage = {
          version: firmware.version,
          url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/firmware/download/${firmware.id}`,
          size: firmware.size,
          timestamp: new Date().toISOString(),
        };

        const topic = `ota/${device.mac}/update`;
        
        // Publicar mensaje MQTT
        await mqttManager.publish(topic, JSON.stringify(otaMessage));
        
        // Actualizar estado del dispositivo
        await prisma.device.update({
          where: { id: device.id },
          data: { 
            status: 'UPDATING',
            health: 'WARNING'
          },
        });

        deploymentResults.push({
          deviceId: device.id,
          deviceMac: device.mac,
          deviceName: device.name,
          status: 'sent',
          topic,
        });

        console.log(`📡 OTA enviado a ${device.name} (${device.mac}): ${firmware.version}`);

      } catch (error) {
        console.error(`Error deploying to device ${device.id}:`, error);
        deploymentResults.push({
          deviceId: device.id,
          deviceMac: device.mac,
          deviceName: device.name,
          status: 'error',
          error: error.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      firmware: {
        id: firmware.id,
        version: firmware.version,
        filename: firmware.filename,
      },
      deploymentResults,
      totalDevices: devices.length,
      successCount: deploymentResults.filter(r => r.status === 'sent').length,
    });

  } catch (error) {
    console.error('Error deploying firmware:', error);
    return NextResponse.json({ 
      error: 'Failed to deploy firmware',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}