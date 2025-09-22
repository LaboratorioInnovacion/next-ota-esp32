import * as mqtt from 'mqtt';
import { prisma } from './prisma';

class MQTTManager {
  private client: mqtt.MqttClient | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

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

  private subscribeToTopics() {
    if (!this.client) return;


    const topics = [
      'esp32/status',
      'esp32/heartbeat',
      'esp32/debug',
      'esp32/measurements',
      'esp32/sensor'
    ];

    topics.forEach(topic => {
      this.client?.subscribe(topic, (err) => {
        if (err) {
          console.error(`MQTT: Failed to subscribe to ${topic}:`, err);
        } else {
          console.log(`MQTT: Subscribed to ${topic}`);
        }
      });
    });
  }

  private async handleMessage(topic: string, message: Buffer) {
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
  private async handleSensorMessage(payload: any) {
    const { mac, name, temperature, humidity } = payload;
    const device = await prisma.device.findUnique({ where: { mac } });
    if (!device) return;

    // Guardar temperatura
    await prisma.measurement.create({
      data: {
        deviceId: device.id,
        type: 'temperature',
        value: temperature,
        unit: 'C',
      },
    });

    // Guardar humedad
    await prisma.measurement.create({
      data: {
        deviceId: device.id,
        type: 'humidity',
        value: humidity,
        unit: '%',
      },
    });
  }

  private async handleStatusMessage(payload: any) {
    const { mac, name, version, status } = payload;
    
    await prisma.device.upsert({
      where: { mac },
      update: {
        name: name || null,
        version: version || null,
        status: status || 'ONLINE',
        lastSeen: new Date(),
        health: this.calculateHealth(payload),
      },
      create: {
        mac,
        name: name || null,
        version: version || null,
        status: status || 'ONLINE',
        health: this.calculateHealth(payload),
      },
    });
  }

  private async handleHeartbeatMessage(payload: any) {
    const { mac } = payload;
    
    await prisma.device.update({
      where: { mac },
      data: {
        lastSeen: new Date(),
        status: 'ONLINE',
      },
    });
  }

  private async handleDebugMessage(payload: any) {
    const { mac, level, message } = payload;
    
    const device = await prisma.device.findUnique({
      where: { mac },
    });

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

  private async handleMeasurementMessage(payload: any) {
    const { mac, measurements } = payload;
    
    const device = await prisma.device.findUnique({
      where: { mac },
    });

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

  private calculateHealth(payload: any): 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN' {
    // Simple health calculation based on device data
    if (payload.battery && payload.battery < 20) return 'CRITICAL';
    if (payload.temperature && payload.temperature > 80) return 'WARNING';
    return 'HEALTHY';
  }

  async publishOTAUpdate(deviceMac: string | null, firmwareUrl: string, version: string) {
    if (!this.client) {
      throw new Error('MQTT client not connected');
    }

    const topic = deviceMac ? `esp32/ota/${deviceMac}` : 'esp32/ota/all';
    const message = JSON.stringify({
      url: firmwareUrl,
      version,
      timestamp: new Date().toISOString(),
    });

    return new Promise<void>((resolve, reject) => {
      this.client!.publish(topic, message, { qos: 1 }, (error) => {
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

export const mqttManager = new MQTTManager();