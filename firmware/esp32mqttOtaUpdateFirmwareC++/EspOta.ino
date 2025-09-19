#include "Esp32OTA.h"

// Configuración (ajusta según tus credenciales y parámetros)
const char* WIFI_SSID     = "Tu_SSID";
const char* WIFI_PASSWORD = "Tu_Password";
const char* MQTT_HOST     = "ad11f935a9c74146a4d2e647921bf024.s1.eu.hivemq.cloud";
const int   MQTT_PORT     = 8883;
const char* MQTT_USER     = "Augustodelcampo97";
const char* MQTT_PASS     = "Augustodelcampo97";
const char* DEVICE_NAME   = "ESP32_Device";
const char* FIRMWARE_VER  = "1.0.0";

// Instancia de la clase
Esp32OTA esp32OTA(WIFI_SSID, WIFI_PASSWORD, MQTT_HOST, MQTT_PORT, MQTT_USER, MQTT_PASS, DEVICE_NAME, FIRMWARE_VER);

void setup() {
  esp32OTA.begin();
}

void loop() {
  esp32OTA.loop();
  // Aquí puedes agregar otras funcionalidades de tu aplicación.
  delay(10);
}
