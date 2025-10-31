import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';

// Forzar renderizado dinámico para Vercel
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('firmware');
    const version = formData.get('version');

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (!version) {
      return NextResponse.json({ error: 'Version is required' }, { status: 400 });
    }

    // Validar extensión del archivo
    const allowedExtensions = ['.bin', '.hex', '.elf'];
    const fileExtension = path.extname(file.name).toLowerCase();
    
    if (!allowedExtensions.includes(fileExtension)) {
      return NextResponse.json({ 
        error: `Invalid file extension. Allowed: ${allowedExtensions.join(', ')}` 
      }, { status: 400 });
    }

    // Crear directorio si no existe
    const uploadDir = path.join(process.cwd(), 'uploads', 'firmware');
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // Generar nombre único para el archivo
    const fileId = uuidv4();
    const filename = `${fileId}_${file.name}`;
    const filepath = path.join(uploadDir, filename);

    // Escribir archivo
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    await writeFile(filepath, buffer);

    // Guardar información en la base de datos
    const firmware = await prisma.firmware.create({
      data: {
        filename: file.name,
        version,
        size: buffer.length,
        filePath: filepath,
      },
    });

    console.log(`📦 Firmware subido: ${file.name} (${version}) - Size: ${buffer.length} bytes`);

    return NextResponse.json({
      success: true,
      firmware: {
        id: firmware.id,
        filename: firmware.filename,
        version: firmware.version,
        size: firmware.size,
        uploadedAt: firmware.uploadedAt,
      },
    });

  } catch (error) {
    console.error('Error uploading firmware:', error);
    return NextResponse.json({ 
      error: 'Failed to upload firmware',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    const firmwares = await prisma.firmware.findMany({
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true,
        filename: true,
        version: true,
        size: true,
        uploadedAt: true,
      },
    });

    return NextResponse.json({
      count: firmwares.length,
      firmwares,
    });

  } catch (error) {
    console.error('Error fetching firmware list:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch firmware list',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}