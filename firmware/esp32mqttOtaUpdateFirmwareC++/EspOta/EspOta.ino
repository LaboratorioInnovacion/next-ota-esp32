#include "Esp32OTA.h"
#include <DHT.h>

// Configuración (ajusta según tus credenciales y parámetros)
const char* WIFI_SSID     = "PB02";
const char* WIFI_PASSWORD = "12345678";
const char* MQTT_HOST     = "ad11f935a9c74146a4d2e647921bf024.s1.eu.hivemq.cloud";
const int   MQTT_PORT     = 8883;
const char* MQTT_USER     = "Augustodelcampo97";
const char* MQTT_PASS     = "Augustodelcampo97";
const char* DEVICE_NAME   = "ESP32_Device3";
const char* FIRMWARE_VER  = "1.0.0";


// Configuración del sensor DHT11
// #define DHTPIN 4 // Cambia el pin si es necesario
#define DHTPIN 15 // Cambia el pin si es necesario
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

// Instancia de la clase
Esp32OTA esp32OTA(WIFI_SSID, WIFI_PASSWORD, MQTT_HOST, MQTT_PORT, MQTT_USER, MQTT_PASS, DEVICE_NAME, FIRMWARE_VER);


unsigned long lastSensorSent = 0;

void setup() {
  esp32OTA.begin();
  dht.begin();
}


void loop() {
  esp32OTA.loop();

  // Enviar datos del sensor cada 10 minutos (600000 ms)
  if (millis() - lastSensorSent > 600000) {
    float temp = dht.readTemperature();
    float hum = dht.readHumidity();
    if (!isnan(temp) && !isnan(hum)) {
      esp32OTA.sendSensorData(temp, hum);
    }
    lastSensorSent = millis();
  }

  delay(10);
}
