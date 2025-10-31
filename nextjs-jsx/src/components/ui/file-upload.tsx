'use client';

import React, { useCallback, useState } from 'react';
import { Upload, X, File } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
  accept?: string;
  maxSize?: number;
  className?: string;
  disabled?: boolean;
}

export function FileUpload({ 
  onFileSelect, 
  accept = '.bin', 
  maxSize = 10 * 1024 * 1024, // 10MB
  className,
  disabled = false 
}: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      const file = files[0];
      if (file.size <= maxSize && file.name.endsWith('.bin')) {
        setSelectedFile(file);
        onFileSelect(file);
      } else {
        alert('Archivo inválido. Solo se permiten archivos .bin de hasta 10MB.');
      }
    }
  }, [onFileSelect, maxSize, disabled]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      const file = files[0];
      if (file.size <= maxSize && file.name.endsWith('.bin')) {
        setSelectedFile(file);
        onFileSelect(file);
      } else {
        alert('Archivo inválido. Solo se permiten archivos .bin de hasta 10MB.');
      }
    }
  }, [onFileSelect, maxSize]);

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    onFileSelect(null);
  }, [onFileSelect]);

  return (
    <div className={cn('w-full', className)}>
      {!selectedFile ? (
        <div
          className={cn(
            'relative border-2 border-dashed rounded-lg p-8 transition-colors',
            'hover:bg-gray-50 cursor-pointer',
            dragActive ? 'border-purple-500 bg-purple-50' : 'border-gray-300',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !disabled && document.getElementById('file-input')?.click()}
        >
          <input
            id="file-input"
            type="file"
            accept={accept}
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={disabled}
          />
          <div className="text-center">
            <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-lg font-medium text-gray-900 mb-2">
              Arrastra y suelta o haz clic para seleccionar
            </p>
            <p className="text-sm text-gray-500">
              Solo se admiten archivos .bin
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
          <div className="flex items-center space-x-3">
            <File className="h-8 w-8 text-purple-600" />
            <div>
              <p className="font-medium text-gray-900">{selectedFile.name}</p>
              <p className="text-sm text-gray-500">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>
          <button
            onClick={handleRemoveFile}
            className="p-2 hover:bg-gray-200 rounded-full transition-colors"
            disabled={disabled}
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      )}
    </div>
  );
}