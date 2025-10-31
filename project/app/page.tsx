'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DeviceTable } from '@/components/device-table';
import { DebugLogs } from '@/components/debug-logs';
import { FirmwareUpload } from '@/components/firmware-upload';
import { SensorData } from '@/components/sensor-data';
import { useSocket } from '@/hooks/use-socket';
import { Zap } from 'lucide-react';

interface Device {
  id: string;
  mac: string;
  name: string | null;
  status: 'ONLINE' | 'OFFLINE' | 'UPDATING' | 'ERROR';
  version: string | null;
  lastSeen: string;
  health: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
}

interface DebugLog {
  id: string;
  level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
  message: string;
  timestamp: string;
  device?: {
    mac: string;
    name: string | null;
  };
}

export default function Dashboard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [loading, setLoading] = useState(true);
  const { socket, connected } = useSocket();

  const fetchDevices = useCallback(async () => {
    try {
      const response = await fetch('/api/devices');
      if (response.ok) {
        const data = await response.json();
        setDevices(data);
      }
    } catch (error) {
      console.error('Error fetching devices:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const response = await fetch('/api/logs?limit=100');
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    fetchLogs();

    const interval = setInterval(() => {
      if (!connected) {
        // Solo hacer polling si no estamos conectados por Socket.IO
        fetchDevices();
      }
    }, 60000); // Refresh devices every 60 seconds solo si no hay conexión WebSocket

    return () => clearInterval(interval);
  }, [fetchDevices, fetchLogs, connected]);

  useEffect(() => {
    if (socket) {
      socket.on('device-update', (updatedDevice: Device) => {
        console.log('Device update received:', updatedDevice);
        setDevices(prevDevices => {
          const index = prevDevices.findIndex(d => d.mac === updatedDevice.mac);
          if (index >= 0) {
            const newDevices = [...prevDevices];
            newDevices[index] = { ...newDevices[index], ...updatedDevice };
            return newDevices;
          }
          // Si es un nuevo dispositivo, agregarlo
          return [...prevDevices, updatedDevice];
        });
      });

      socket.on('log-update', (newLog: DebugLog) => {
        setLogs(prevLogs => [newLog, ...prevLogs.slice(0, 99)]);
      });

      return () => {
        socket.off('device-update');
        socket.off('log-update');
      };
    }
  }, [socket]);

  const handleFirmwareUpload = async (file: File, version: string, targetDeviceId: string | null) => {
    const formData = new FormData();
    formData.append('firmware', file);
    formData.append('version', version);

    // Upload firmware
    const uploadResponse = await fetch('/api/firmware/upload', {
      method: 'POST',
      body: formData,
    });

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload firmware');
    }

    const firmware = await uploadResponse.json();

    // Deploy firmware
    const deployResponse = await fetch('/api/firmware/deploy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        firmwareId: firmware.id,
        deviceId: targetDeviceId,
      }),
    });

    if (!deployResponse.ok) {
      throw new Error('Failed to deploy firmware');
    }

    // Refresh devices to show updated status
    fetchDevices();
  };

  const handleClearLogs = async () => {
    try {
      const response = await fetch('/api/logs', {
        method: 'DELETE',
      });
      if (response.ok) {
        setLogs([]);
      }
    } catch (error) {
      console.error('Error clearing logs:', error);
      throw error;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Zap className="h-8 w-8 text-purple-600 mr-3" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">FIRMWAVE</h1>
                <p className="text-sm text-gray-500">Panel de Control</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`}></div>
                <span className="text-sm text-gray-600">
                  {connected ? 'Socket Conectado' : 'Socket Desconectado'}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                Hora actual: {new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Device Status Section */}
          <section>
            <div className="flex items-center mb-4">
              <Zap className="h-5 w-5 text-purple-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">
                Estado de Dispositivos
              </h2>
            </div>
            <DeviceTable devices={devices} loading={loading} />
          </section>

          {/* Sensor Data Section */}
          <section>
            <SensorData devices={devices} />
          </section>

          {/* Two column layout for Firmware Upload and Debug Logs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Firmware Upload Section */}
            <section>
              <FirmwareUpload
                devices={devices}
                onUpload={handleFirmwareUpload}
                loading={loading}
              />
            </section>

            {/* Debug Logs Section */}
            <section>
              <DebugLogs
                logs={logs}
                onClear={handleClearLogs}
              />
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}