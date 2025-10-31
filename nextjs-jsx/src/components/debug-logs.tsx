'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

const getLevelColor = (level) => {
  const colors = {
    DEBUG: 'text-gray-600',
    INFO: 'text-blue-600',
    WARNING: 'text-yellow-600',
    ERROR: 'text-red-600',
  };
  return colors[level];
};

export function DebugLogs({ logs, onClear }: DebugLogsProps) {
  const [isClearing, setIsClearing] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  const copyLogs = async () => {
    const logsText = logs
      .map((log) => {
        const timestamp = new Date(log.timestamp).toLocaleString('es-ES');
        const deviceInfo = log.device ? `[${log.device.mac}]` : '[SYSTEM]';
        return `[${timestamp}] ${deviceInfo} [${log.level}] ${log.message}`;
      })
      .join('\n');

    try {
      await navigator.clipboard.writeText(logsText);
      // You might want to show a toast notification here
    } catch (err) {
      console.error('Error copying logs:', err);
    }
  };

  const handleClear = async () => {
    setIsClearing(true);
    try {
      await onClear();
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b bg-gray-50">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <span className="mr-2">▷</span>
          Logs de Depuración
        </h3>
        <div className="flex space-x-2">
          <Button
            size="sm"
            variant="outline"
            onClick={copyLogs}
            disabled={logs.length === 0}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copiar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleClear}
            disabled={logs.length === 0 || isClearing}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {isClearing ? 'Limpiando...' : 'Limpiar'}
          </Button>
        </div>
      </div>

      <div className="h-80 overflow-y-auto bg-gray-900 text-white font-mono text-sm">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            No hay logs disponibles
          </div>
        ) : (
          <div className="p-4 space-y-1">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start space-x-3">
                <span className="text-gray-400 text-xs whitespace-nowrap">
                  [{formatDistanceToNow(new Date(log.timestamp), { locale: es })}]
                </span>
                <span className={`text-xs font-semibold ${getLevelColor(log.level)}`}>
                  [{log.level}]
                </span>
                {log.device && (
                  <span className="text-cyan-400 text-xs">
                    [{log.device.mac}]
                  </span>
                )}
                <span className="text-white text-xs break-words flex-1">
                  {log.message}
                </span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}