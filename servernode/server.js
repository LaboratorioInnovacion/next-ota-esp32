// server.js
const { mqttManager } = require('./lib/mqtt-client');
const { initSocketServer } = require('./lib/socket-server');

const http = require('http');
const PORT = process.env.PORT || 3000;

// Crear servidor HTTP principal
const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify({ 
    status: 'active', 
    service: 'MQTT and Socket.IO Server',
    timestamp: new Date().toISOString()
  }));
});

async function start() {
  console.log('Iniciando servicio MQTT y Socket.IO...');
  await mqttManager.connect();
  await initSocketServer(server); // Pasar el servidor HTTP
  
  server.listen(PORT, () => {
    console.log(`Servidor HTTP y Socket.IO escuchando en puerto ${PORT}`);
  });
  
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
