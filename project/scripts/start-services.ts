import { spawn } from 'child_process';
import { initSocketServer } from '../lib/socket-server';
import { mqttManager } from '../lib/mqtt-client';

async function startServices() {
  console.log('Starting IoT management services...');

  try {
    // Initialize Socket.IO server
    console.log('Starting Socket.IO server...');
    await initSocketServer();

    // Initialize MQTT connection
    console.log('Connecting to MQTT broker...');
    await mqttManager.connect();

    console.log('All services started successfully!');
  } catch (error) {
    console.error('Failed to start services:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down services...');
  mqttManager.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down services...');
  mqttManager.disconnect();
  process.exit(0);
});

startServices();