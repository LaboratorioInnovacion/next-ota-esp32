import { mqttManager } from '../lib/mqtt-client';

async function initializeMQTT() {
  console.log('Initializing MQTT connection...');
  try {
    await mqttManager.connect();
    console.log('MQTT connection established');
  } catch (error) {
    console.error('Failed to initialize MQTT:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down MQTT connection...');
  mqttManager.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down MQTT connection...');
  mqttManager.disconnect();
  process.exit(0);
});

initializeMQTT();