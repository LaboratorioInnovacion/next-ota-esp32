'use client';

import React, { useCallback, useState } from 'react';
import { Upload, X, File } from 'lucide-react';
import { cn } from '@/lib/utils';

export function FileUpload({ 
  onFileSelect, 
  accept = '.bin', 
  maxSize = 10 * 1024 * 1024, // 10MB
  className,
  disabled = false 
}) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setDragOver(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      handleFileSelection(file);
    }
  }, [disabled]);

  const handleFileSelection = (file) => {
    // Validar tipo de archivo
    if (accept && !file.name.toLowerCase().endsWith(accept.toLowerCase())) {
      alert(`Solo se permiten archivos ${accept}`);
      return;
    }

    // Validar tamaño
    if (file.size > maxSize) {
      alert(`El archivo es demasiado grande. Máximo permitido: ${Math.round(maxSize / (1024 * 1024))}MB`);
      return;
    }

    setSelectedFile(file);
    onFileSelect(file);
  };

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    onFileSelect(null);
  };

  return (
    <div className={cn('w-full', className)}>
      {selectedFile ? (
        <div className="flex items-center justify-between p-4 border border-green-200 bg-green-50 rounded-lg">
          <div className="flex items-center space-x-2">
            <File className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-sm font-medium text-green-800">{selectedFile.name}</p>
              <p className="text-xs text-green-600">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
          </div>
          <button
            onClick={removeFile}
            disabled={disabled}
            className="p-1 hover:bg-green-100 rounded-full transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4 text-green-600" />
          </button>
        </div>
      ) : (
        <div
          className={cn(
            'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
            dragOver ? 'border-primary bg-primary/5' : 'border-gray-300',
            disabled ? 'cursor-not-allowed opacity-50' : 'hover:border-primary hover:bg-primary/5'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && document.getElementById('file-input')?.click()}
        >
          <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-900 mb-2">
            Selecciona o arrastra un archivo
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Archivos {accept} hasta {Math.round(maxSize / (1024 * 1024))}MB
          </p>
          <input
            id="file-input"
            type="file"
            accept={accept}
            onChange={handleFileInput}
            disabled={disabled}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
}