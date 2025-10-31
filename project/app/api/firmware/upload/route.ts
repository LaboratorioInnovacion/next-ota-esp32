import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';

// Forzar renderizado dinámico para Vercel
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('firmware') as File;
    const version = formData.get('version') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (!version) {
      return NextResponse.json({ error: 'Version is required' }, { status: 400 });
    }

    // Validate file type
    if (!file.name.endsWith('.bin')) {
      return NextResponse.json({ error: 'Only .bin files are allowed' }, { status: 400 });
    }

    // Validate file size (10MB max)
    const maxSize = parseInt(process.env.MAX_FILE_SIZE || '10485760', 10);
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File too large' }, { status: 400 });
    }

    // Create firmware directory if it doesn't exist
    const uploadDir = path.join(process.cwd(), 'public', 'firmware');
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // Generate unique filename
    const fileId = uuidv4();
    const filename = `${fileId}-${file.name}`;
    const filepath = path.join(uploadDir, filename);

    // Write file to disk
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);

    // Save firmware info to database
    const firmware = await prisma.firmware.create({
      data: {
        filename: file.name,
        version,
        size: file.size,
        filePath: `/firmware/${filename}`,
      },
    });

    return NextResponse.json({
      id: firmware.id,
      filename: firmware.filename,
      version: firmware.version,
      size: firmware.size,
      url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}${firmware.filePath}`,
    });
  } catch (error) {
    console.error('Error uploading firmware:', error);
    return NextResponse.json({ error: 'Failed to upload firmware' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const firmwares = await prisma.firmware.findMany({
      orderBy: { uploadedAt: 'desc' },
    });

    return NextResponse.json(firmwares);
  } catch (error) {
    console.error('Error fetching firmware list:', error);
    return NextResponse.json({ error: 'Failed to fetch firmware list' }, { status: 500 });
  }
}