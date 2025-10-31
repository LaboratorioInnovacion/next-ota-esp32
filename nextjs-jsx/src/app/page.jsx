'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DeviceTable } from '@/components/device-table';
import { DebugLogs } from '@/components/debug-logs';
import { FirmwareUpload } from '@/components/firmware-upload';
import { SensorData } from '@/components/sensor-data';
import { useSocket } from '@/hooks/use-socket';
import { Zap } from 'lucide-react';

export default function Dashboard() {
  const [devices, setDevices] = useState([]);
  const [logs, setLogs] = useState([]);
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
      socket.on('device-update', (updatedDevice) => {
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

      socket.on('log-update', (newLog) => {
        setLogs(prevLogs => [newLog, ...prevLogs.slice(0, 99)]);
      });

      return () => {
        socket.off('device-update');
        socket.off('log-update');
      };
    }
  }, [socket]);

  const handleFirmwareUpload = async (file, version, targetDeviceId) => {
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
// import Image from "next/image";

// export default function Home() {
//   return (
//     <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
//       <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
//         <Image
//           className="dark:invert"
//           src="/next.svg"
//           alt="Next.js logo"
//           width={100}
//           height={20}
//           priority
//         />
//         <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
//           <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
//             To get started, edit the page.js file.
//           </h1>
//           <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
//             Looking for a starting point or more instructions? Head over to{" "}
//             <a
//               href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
//               className="font-medium text-zinc-950 dark:text-zinc-50"
//             >
//               Templates
//             </a>{" "}
//             or the{" "}
//             <a
//               href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
//               className="font-medium text-zinc-950 dark:text-zinc-50"
//             >
//               Learning
//             </a>{" "}
//             center.
//           </p>
//         </div>
//         <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
//           <a
//             className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-[158px]"
//             href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
//             target="_blank"
//             rel="noopener noreferrer"
//           >
//             <Image
//               className="dark:invert"
//               src="/vercel.svg"
//               alt="Vercel logomark"
//               width={16}
//               height={16}
//             />
//             Deploy Now
//           </a>
//           <a
//             className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a] md:w-[158px]"
//             href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
//             target="_blank"
//             rel="noopener noreferrer"
//           >
//             Documentation
//           </a>
//         </div>
//       </main>
//     </div>
//   );
// }
