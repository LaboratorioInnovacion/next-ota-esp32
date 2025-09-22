import { Server } from 'socket.io';
import { createServer } from 'http';

let io: Server;

export const initSocketServer = async () => {
  const server = createServer();

  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', (socket) => {
    console.log('Socket.IO: Client connected:', socket.id);

    socket.on('disconnect', () => {
      console.log('Socket.IO: Client disconnected:', socket.id);
    });
  });

  const port = parseInt(process.env.SOCKET_IO_PORT || '3001', 10);
  server.listen(port, () => {
    console.log(`Socket.IO server running on port ${port}`);
  });

  return io;
};

export const getSocketServer = () => io;

export const emitDeviceUpdate = (device: any) => {
  if (io) {
    io.emit('device-update', device);
  }
};

export const emitLogUpdate = (log: any) => {
  if (io) {
    io.emit('log-update', log);
  }
};