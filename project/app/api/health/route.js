import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Forzar renderizado dinámico para Vercel
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    console.log('🔍 Probando conexión a la base de datos...');
    
    // Test básico de conexión
    const result = await prisma.$queryRaw`SELECT NOW() as current_time`;
    console.log('✅ Conexión exitosa:', result);
    
    // Contar dispositivos
    const deviceCount = await prisma.device.count();
    console.log(`📊 Dispositivos en DB: ${deviceCount}`);
    
    // Contar mediciones
    const measurementCount = await prisma.measurement.count();
    console.log(`📈 Mediciones en DB: ${measurementCount}`);
    
    return NextResponse.json({
      success: true,
      database: {
        connected: true,
        currentTime: result[0]?.current_time,
        counts: {
          devices: deviceCount,
          measurements: measurementCount
        }
      }
    });

  } catch (error) {
    console.error('❌ Error de conexión a la base de datos:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Database connection failed',
      details: error.message,
      code: error.code || 'UNKNOWN'
    }, { status: 500 });
  }
}