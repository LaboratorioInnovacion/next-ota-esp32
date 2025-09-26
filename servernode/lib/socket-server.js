const { Server } = require('socket.io');
const { createServer } = require('http');

let io;

const initSocketServer = async (httpServer) => {
  // Si no se pasa un servidor HTTP, crear uno nuevo (para compatibilidad)
  const server = httpServer || createServer();

  io = new Server(server, {
    cors: {
      origin: ["https://next-ota-esp32.vercel.app", "http://localhost:3000", "*"],
      methods: ["GET", "POST"],
      credentials: true
    },
    allowEIO3: true,
    transports: ['websocket', 'polling']
  });

  io.on('connection', (socket) => {
    console.log('Socket.IO: Client connected:', socket.id);

    socket.on('disconnect', () => {
      console.log('Socket.IO: Client disconnected:', socket.id);
    });
  });

  // Solo escuchar en un puerto separado si no se pasó un servidor HTTP
  if (!httpServer) {
    const port = parseInt(process.env.SOCKET_IO_PORT || '3001', 10);
    server.listen(port, () => {
      console.log(`Socket.IO server running on port ${port}`);
    });
  } else {
    console.log('Socket.IO attached to main HTTP server');
  }

  return io;
};

const getSocketServer = () => io;

const emitDeviceUpdate = (device) => {
  if (io) {
    io.emit('device-update', device);
  }
};

const emitLogUpdate = (log) => {
  if (io) {
    io.emit('log-update', log);
  }
};

module.exports = {
  initSocketServer,
  getSocketServer,
  emitDeviceUpdate,
  emitLogUpdate
};
