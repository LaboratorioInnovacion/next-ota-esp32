import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/measurements?deviceId=xxx&type=temperature&limit=100
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId');
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    const where: any = {};
    if (deviceId) where.deviceId = deviceId;
    if (type) where.type = type;

    const measurements = await prisma.measurement.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      include: {
        device: {
          select: { mac: true, name: true }
        }
      }
    });

    return NextResponse.json(measurements);
  } catch (error) {
    console.error('Error fetching measurements:', error);
    return NextResponse.json({ error: 'Failed to fetch measurements' }, { status: 500 });
  }
}
