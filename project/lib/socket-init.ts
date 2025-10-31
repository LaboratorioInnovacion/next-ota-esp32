// Inicialización automática de Socket.IO
import { initSocketServer } from './socket-server';

let socketInitialized = false;

export const ensureSocketServer = async () => {
  if (!socketInitialized && typeof window === 'undefined') {
    try {
      await initSocketServer();
      socketInitialized = true;
      console.log('✅ Socket.IO server initialized');
    } catch (error) {
      console.error('❌ Error initializing Socket.IO server:', error);
    }
  }
};

// Auto-inicializar en server-side
if (typeof window === 'undefined') {
  ensureSocketServer();
}