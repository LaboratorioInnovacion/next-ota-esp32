import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Forzar renderizado dinámico para Vercel
export const dynamic = 'force-dynamic';

// GET /api/measurements?mac=AA:BB:CC:DD:EE:FF&deviceId=xxx&type=temperature&limit=100
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId');
    const mac = searchParams.get('mac');
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    const where = {};
    
    // Filtrar por deviceId directo o por MAC
    if (deviceId) {
      where.deviceId = deviceId;
    } else if (mac) {
      const device = await prisma.device.findUnique({
        where: { mac },
        select: { id: true }
      });
      if (device) {
        where.deviceId = device.id;
      } else {
        return NextResponse.json({ 
          error: 'Device not found with MAC: ' + mac 
        }, { status: 404 });
      }
    }
    
    // Filtrar por tipo de medición
    if (type) where.type = type;

    const measurements = await prisma.measurement.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: Math.min(limit, 500), // Máximo 500 mediciones
      include: {
        device: {
          select: { mac: true, name: true, status: true }
        }
      }
    });

    // Agrupar por tipo para estadísticas básicas
    const stats = measurements.reduce((acc, measurement) => {
      if (!acc[measurement.type]) {
        acc[measurement.type] = {
          count: 0,
          latest: null,
          avg: 0,
          min: Number.MAX_VALUE,
          max: Number.MIN_VALUE,
          sum: 0
        };
      }
      
      const stat = acc[measurement.type];
      stat.count++;
      stat.sum += measurement.value;
      stat.avg = stat.sum / stat.count;
      stat.min = Math.min(stat.min, measurement.value);
      stat.max = Math.max(stat.max, measurement.value);
      
      if (!stat.latest || measurement.timestamp > stat.latest.timestamp) {
        stat.latest = {
          value: measurement.value,
          unit: measurement.unit,
          timestamp: measurement.timestamp
        };
      }
      
      return acc;
    }, {});

    return NextResponse.json({
      count: measurements.length,
      measurements,
      statistics: stats
    });
  } catch (error) {
    console.error('Error fetching measurements:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch measurements',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}