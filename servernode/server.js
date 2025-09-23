// server.js
const { mqttManager } = require('./lib/mqtt-client');
const { initSocketServer } = require('./lib/socket-server');

const http = require('http');
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Servicio activo');
}).listen(PORT, () => {
  console.log(`Servidor HTTP escuchando en puerto ${PORT}`);
});


async function start() {
  console.log('Iniciando servicio MQTT y Socket.IO...');
  await mqttManager.connect();
  await initSocketServer();
  console.log('Servicios iniciados correctamente');
}

start();

// Manejo de cierre limpio
global.process.on('SIGINT', () => {
  console.log('Cerrando servicios...');
  mqttManager.disconnect();
  process.exit(0);
});
global.process.on('SIGTERM', () => {
  console.log('Cerrando servicios...');
  mqttManager.disconnect();
  process.exit(0);
});
