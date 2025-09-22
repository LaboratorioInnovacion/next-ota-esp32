// server.js
const { mqttManager } = require('./lib/mqtt-client');
const { initSocketServer } = require('./lib/socket-server');

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
