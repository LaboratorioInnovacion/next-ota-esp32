'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface Device {
  id: string;
  mac: string;
  name: string | null;
  status: 'ONLINE' | 'OFFLINE' | 'UPDATING' | 'ERROR';
  version: string | null;
  lastSeen: string;
  health: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
}

interface DeviceTableProps {
  devices: Device[];
  loading?: boolean;
}

const getStatusBadge = (status: Device['status']) => {
  const variants = {
    ONLINE: 'bg-green-100 text-green-800',
    OFFLINE: 'bg-gray-100 text-gray-800',
    UPDATING: 'bg-blue-100 text-blue-800',
    ERROR: 'bg-red-100 text-red-800',
  };

  const labels = {
    ONLINE: 'En línea',
    OFFLINE: 'Desconectado',
    UPDATING: 'Actualizando',
    ERROR: 'Error',
  };

  return (
    <Badge className={variants[status]}>
      {labels[status]}
    </Badge>
  );
};

const getHealthBadge = (health: Device['health']) => {
  const variants = {
    HEALTHY: 'bg-green-100 text-green-800',
    WARNING: 'bg-yellow-100 text-yellow-800',
    CRITICAL: 'bg-red-100 text-red-800',
    UNKNOWN: 'bg-gray-100 text-gray-800',
  };

  const labels = {
    HEALTHY: 'Saludable',
    WARNING: 'Advertencia',
    CRITICAL: 'Crítico',
    UNKNOWN: 'Desconocido',
  };

  return (
    <Badge className={variants[health]}>
      {labels[health]}
    </Badge>
  );
};

export function DeviceTable({ devices, loading = false }: DeviceTableProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg border">
        <div className="p-6">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="bg-white rounded-lg border">
        <div className="p-12 text-center">
          <div className="text-6xl mb-4">📡</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No hay dispositivos conectados
          </h3>
          <p className="text-gray-500">
            Esperando a que los dispositivos ESP32 se conecten...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                MAC
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                NOMBRE
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ESTADO
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                VERSIÓN
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ÚLTIMO VISTO
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                SALUD
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {devices.map((device) => (
              <tr key={device.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                  {device.mac}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {device.name || 'Sin nombre'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(device.status)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {device.version || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDistanceToNow(new Date(device.lastSeen), {
                    addSuffix: true,
                    locale: es,
                  })}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getHealthBadge(device.health)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}