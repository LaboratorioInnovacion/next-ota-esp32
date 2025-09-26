const mqtt = require('mqtt');
const { prisma } = require('./prisma');
const { emitDeviceUpdate, emitLogUpdate } = require('./socket-server');

class MQTTManager {
  constructor() {
    this.client = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }

  // Función auxiliar para obtener la fecha argentina (UTC-3)
  getArgentinaTime() {
    // Argentina está UTC-3, así que necesitamos restar 3 horas del UTC
    const now = new Date();
    const argentinaTime = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    return argentinaTime;
  }

  async connect() {
    try {
      const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
      this.client = mqtt.connect(brokerUrl, {
        username: process.env.MQTT_USERNAME || '',
        password: process.env.MQTT_PASSWORD || '',
        keepalive: 60,
        reconnectPeriod: 5000,
        connectTimeout: 30000,
      });

      this.client.on('connect', () => {
        console.log('MQTT: Connected to broker');
        this.reconnectAttempts = 0;
        this.subscribeToTopics();
      });

      this.client.on('message', this.handleMessage.bind(this));

      this.client.on('error', (error) => {
        console.error('MQTT Error:', error);
      });

      this.client.on('reconnect', () => {
        this.reconnectAttempts++;
        if (this.reconnectAttempts <= this.maxReconnectAttempts) {
          console.log(`MQTT: Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        }
      });

      this.client.on('offline', () => {
        console.log('MQTT: Client offline');
      });
    } catch (error) {
      console.error('MQTT: Connection failed', error);
    }
  }

  subscribeToTopics() {
    if (!this.client) return;
    const topics = [
      'esp32/status',
      'esp32/heartbeat',
      'esp32/debug',
      'esp32/measurements',
      'esp32/sensor'
    ];
    topics.forEach(topic => {
      this.client.subscribe(topic, (err) => {
        if (err) {
          console.error(`MQTT: Failed to subscribe to ${topic}:`, err);
        } else {
          console.log(`MQTT: Subscribed to ${topic}`);
        }
      });
    });
  }

  async handleMessage(topic, message) {
    try {
      const payload = JSON.parse(message.toString());
      console.log(`MQTT: Received message on ${topic}:`, payload);
      switch (topic) {
        case 'esp32/status':
          await this.handleStatusMessage(payload);
          break;
        case 'esp32/heartbeat':
          await this.handleHeartbeatMessage(payload);
          break;
        case 'esp32/debug':
          await this.handleDebugMessage(payload);
          break;
        case 'esp32/measurements':
          await this.handleMeasurementMessage(payload);
          break;
        case 'esp32/sensor':
          await this.handleSensorMessage(payload);
          break;
      }
    } catch (error) {
      console.error(`MQTT: Error processing message from ${topic}:`, error);
    }
  }

  async handleSensorMessage(payload) {
    const { mac, name, temperature, humidity } = payload;
    const device = await prisma.device.findUnique({ where: { mac } });
    if (!device) return;
    await prisma.measurement.create({
      data: {
        deviceId: device.id,
        type: 'temperature',
        value: temperature,
        unit: 'C',
      },
    });
    await prisma.measurement.create({
      data: {
        deviceId: device.id,
        type: 'humidity',
        value: humidity,
        unit: '%',
      },
    });
  }

  async handleStatusMessage(payload) {
    const { mac, name, version, status } = payload;
    const nowArgentina = this.getArgentinaTime();
    const device = await prisma.device.upsert({
      where: { mac },
      update: {
        name: name || null,
        version: version || null,
        status: status || 'ONLINE',
        lastSeen: nowArgentina,
        health: this.calculateHealth(payload),
        updatedAt: nowArgentina,
      },
      create: {
        mac,
        name: name || null,
        version: version || null,
        status: status || 'ONLINE',
        health: this.calculateHealth(payload),
        lastSeen: nowArgentina,
      },
    });
    
    // Emitir actualización a clientes conectados
    emitDeviceUpdate(device);
  }

  async handleHeartbeatMessage(payload) {
    const { mac, name } = payload;
    const nowArgentina = this.getArgentinaTime();
    const device = await prisma.device.upsert({
      where: { mac },
      update: {
        lastSeen: nowArgentina,
        status: 'ONLINE',
        name: name || undefined, // Actualiza el nombre si viene en el payload
        updatedAt: nowArgentina,
      },
      create: {
        mac,
        name: name || null,
        status: 'ONLINE',
        lastSeen: nowArgentina,
      },
    });
    
    // Emitir actualización a clientes conectados
    emitDeviceUpdate(device);
  }

  async handleDebugMessage(payload) {
    const { mac, level, message } = payload;
    const device = await prisma.device.findUnique({ where: { mac } });
    if (device) {
      await prisma.debugLog.create({
        data: {
          deviceId: device.id,
          level: level || 'INFO',
          message,
        },
      });
    }
  }

  async handleMeasurementMessage(payload) {
    const { mac, measurements } = payload;
    const device = await prisma.device.findUnique({ where: { mac } });
    if (device && measurements) {
      for (const measurement of measurements) {
        await prisma.measurement.create({
          data: {
            deviceId: device.id,
            type: measurement.type,
            value: measurement.value,
            unit: measurement.unit || null,
          },
        });
      }
    }
  }

  calculateHealth(payload) {
    if (payload.battery && payload.battery < 20) return 'CRITICAL';
    if (payload.temperature && payload.temperature > 80) return 'WARNING';
    return 'HEALTHY';
  }

  async publishOTAUpdate(deviceMac, firmwareUrl, version) {
    if (!this.client) {
      throw new Error('MQTT client not connected');
    }
    const topic = deviceMac ? `esp32/ota/${deviceMac}` : 'esp32/ota/all';
    const message = JSON.stringify({
      url: firmwareUrl,
      version,
      timestamp: new Date().toISOString(),
    });
    return new Promise((resolve, reject) => {
      this.client.publish(topic, message, { qos: 1 }, (error) => {
        if (error) {
          reject(error);
        } else {
          console.log(`MQTT: OTA update sent to ${topic}`);
          resolve();
        }
      });
    });
  }

  disconnect() {
    if (this.client) {
      this.client.end();
      this.client = null;
    }
  }
}

module.exports = { mqttManager: new MQTTManager() };
