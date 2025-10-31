'use client';

import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export function useSocket() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Usar variable de entorno si está disponible, sino construir dinámicamente
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 
      (typeof window !== 'undefined' ? `http://localhost:3001` : 'http://localhost:3001');

    console.log('Connecting to Socket.IO server:', socketUrl);

    const socketInstance = io(socketUrl, {
      transports: ['websocket', 'polling'], // Fallback a polling si websocket falla
      upgrade: true,
      rememberUpgrade: true,
    });

    socketInstance.on('connect', () => {
      console.log('Socket connected');
      setConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('Socket disconnected');
      setConnected(false);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.close();
    };
  }, []);

  return { socket, connected };
}