'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileUpload } from '@/components/ui/file-upload';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload } from 'lucide-react';

interface Device {
  id: string;
  mac: string;
  name: string | null;
  status: string;
}

interface FirmwareUploadProps {
  devices: Device[];
  onUpload: (file: File, version: string, targetDevice: string | null) => Promise<void>;
  loading?: boolean;
}

export function FirmwareUpload({ devices, onUpload, loading = false }: FirmwareUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [version, setVersion] = useState('');
  const [targetDevice, setTargetDevice] = useState<string>('all');
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!selectedFile || !version.trim()) {
      alert('Por favor selecciona un archivo y especifica la versión.');
      return;
    }

    setUploading(true);
    try {
      const deviceId = targetDevice === 'all' ? null : targetDevice;
      await onUpload(selectedFile, version.trim(), deviceId);
      
      // Reset form
      setSelectedFile(null);
      setVersion('');
      setTargetDevice('all');
    } catch (error) {
      console.error('Error uploading firmware:', error);
      alert('Error al subir el firmware. Por favor intenta de nuevo.');
    } finally {
      setUploading(false);
    }
  };

  const onlineDevices = devices.filter(device => device.status === 'ONLINE');

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center mb-6">
        <Upload className="h-5 w-5 text-purple-600 mr-2" />
        <h3 className="text-lg font-semibold text-gray-900">
          Actualización de Firmware
        </h3>
      </div>

      <div className="space-y-6">
        <div>
          <Label htmlFor="target-device" className="text-sm font-medium text-gray-700 mb-2 block">
            Dispositivo Objetivo
          </Label>
          <Select value={targetDevice} onValueChange={setTargetDevice}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona un dispositivo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los dispositivos en línea</SelectItem>
              {onlineDevices.map((device) => (
                <SelectItem key={device.id} value={device.id}>
                  {device.name || device.mac} ({device.mac})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-gray-500 mt-2">
            La actualización se aplicará a todos los dispositivos en línea. Los dispositivos fuera de línea se actualizarán cuando se vuelvan a conectar.
          </p>
        </div>

        <div>
          <Label htmlFor="version" className="text-sm font-medium text-gray-700 mb-2 block">
            Versión del Firmware
          </Label>
          <Input
            id="version"
            type="text"
            placeholder="ej: v1.2.3"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            disabled={uploading}
          />
        </div>

        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            Archivo de Firmware (.bin)
          </Label>
          <FileUpload
            onFileSelect={setSelectedFile}
            accept=".bin"
            disabled={uploading}
          />
        </div>

        <Button
          onClick={handleUpload}
          disabled={!selectedFile || !version.trim() || uploading || loading}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white"
        >
          <Upload className="h-4 w-4 mr-2" />
          {uploading ? 'Actualizando Firmware...' : 'Actualizar Firmware'}
        </Button>
      </div>
    </div>
  );
}