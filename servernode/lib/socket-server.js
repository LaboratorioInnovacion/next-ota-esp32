const { Server } = require('socket.io');
const { createServer } = require('http');

let io;

const initSocketServer = async () => {
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
