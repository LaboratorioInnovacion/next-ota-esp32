#include "Esp32OTA.h"

// MQTT settings
const char* MQTT_HOST = "ad11f935a9c74146a4d2e647921bf024.s1.eu.hivemq.cloud";
const int   MQTT_PORT = 8883;
const char* MQTT_USER = "Augustodelcampo97";
const char* MQTT_PASS = "Augustodelcampo97";

Esp32OTA ota(MQTT_HOST, MQTT_PORT, MQTT_USER, MQTT_PASS, "ESPESTACION4", "v1.0.0");

void otaStartedCallback(const String &url) {
  Serial.println("Callback OTA iniciado: " + url);
}

void setup() {
  // agregar redes (orden de prioridad)
  ota.addWiFi("PB02", "12345678");
  ota.addWiFi("Auditorio Nodo", "auditorio.nodo");
  ota.addWiFi("Laboratorio_IoT", "laboratorio2.4");

  ota.setOTAUpdateCallback(otaStartedCallback);
  ota.begin();
}

void loop() {
  // Lógica principal de la app
  ota.loop();

  // ejemplo: enviar datos de sensor cada 30s (simulado)
  static unsigned long last = 0;
  if (millis() - last > 30000) {
    ota.sendSensorData(25.3, 48.1);
    last = millis();
  }

  delay(10); // ciclo ligero
}
