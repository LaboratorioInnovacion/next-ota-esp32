#include "Esp32OTA.h"
#include "DHT.h"
#include "WeatherDelivery.h"
#include "DiagnosticsPolicy.h"

// Configuración del sensor DHT
#define DHTPIN 15        // Pin donde está conectado el sensor DHT (cambia según tu conexión)
#define DHTTYPE DHT11   // Tipo de sensor DHT (DHT11, DHT22, DHT21)
DHT dht(DHTPIN, DHTTYPE);

const char* ssids[] = {""};
const char* passwords[] = {""};

Esp32OTA esp(
  "ad11f935a9c74146a4d2e647921bf024.s1.eu.hivemq.cloud", 1883,
  "Augustodelcampo97", "Augustodelcampo97",
  "Esp32_2", "v1.0.1"
);

// Variables para controlar el envío de datos
weather::Delivery weatherDelivery;
diagnostics::State diagnosticState;
diagnostics::Delivery diagnosticDelivery;
unsigned long lastSensorRead = 0;
float temperature = NAN;
float humidity = NAN;

void setup() {
  Serial.begin(115200);
  Serial.println("🚀 Iniciando ESP32 Meteo Station...");
  
  dht.begin();
  constexpr size_t networkCount = sizeof(ssids) / sizeof(ssids[0]);
  static_assert(networkCount == sizeof(passwords) / sizeof(passwords[0]),
                "WiFi credential arrays must have equal lengths");
  esp.setWiFiNetworks(ssids, passwords, networkCount);
    // 👉 Establecer ubicación geográfica
  esp.setLocation(-28.4762, -65.7863); // Catamarca, Argentina
  // Load persisted metadata after the sketch's fallback location is configured.
  esp.begin();
  weatherDelivery.begin(millis());
  
  lastSensorRead = millis() - 10000UL;
  Serial.println("Setup completado: dos destinos cada 5 minutos, MQTT para OTA.");
}

void loop() {
  esp.loop();
  const unsigned long now = millis();
  diagnosticState.tick(now);
  if (now - lastSensorRead >= 10000UL) {
    lastSensorRead = now;
    temperature = dht.readTemperature();
    humidity = dht.readHumidity();
    diagnosticState.sample(temperature, humidity);
    if (!diagnosticState.valid) Serial.println("Error sensor DHT11");
  }
  diagnosticDelivery.service(diagnosticState,
      []() -> uint32_t { return millis(); },
      []() { return esp.diagnosticsReady(); },
      [](const char* endpoint) {
        return esp.sendDiagnostics(endpoint, diagnosticState.sensorStatus(),
            diagnosticState.errorCode(), diagnosticState.uptimeMs);
      });
  if (diagnosticState.valid) {
    weatherDelivery.service(weather::Sample{temperature, humidity},
        []() -> uint32_t { return millis(); },
        []() { return esp.networkReady(); },
        [](const char* endpoint, const weather::Sample& sample) {
          return esp.sendWeatherData(sample.temperature, sample.humidity, endpoint);
        });
  }
  delay(1); // Yield without starving the local setup service.
}
