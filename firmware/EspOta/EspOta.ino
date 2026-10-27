#include "Esp32OTA.h"
#include "DHT.h"
#include "WeatherDelivery.h"
#include "DiagnosticsPolicy.h"

// Station configuration: edit these values before building each board.
constexpr float DEFAULT_LATITUDE = -28.4762f;
constexpr char STATION_NAME[] = "Esp32_2"; // Firmware fallback; portal overrides HTTP metadata only.
static_assert(sizeof(STATION_NAME) > 1 && sizeof(STATION_NAME) <= 65, "Station name must contain 1-64 UTF-8 bytes");
constexpr float DEFAULT_LONGITUDE = -65.7863f;
// Optional HTTP station identifier, not a WiFi/radio MAC change. Empty uses hardware.
constexpr char STATION_MAC_OVERRIDE[] = "";
constexpr uint32_t DEFAULT_SEND_INTERVAL_SECONDS = 300;
static_assert(provisioning::validSendInterval(DEFAULT_SEND_INTERVAL_SECONDS),
              "Weather send interval must be 60-86400 seconds");
static_assert(provisioning::validCoordinates(DEFAULT_LATITUDE, DEFAULT_LONGITUDE),
              "Station defaults must be finite latitude [-90,90] and longitude [-180,180]");

// Configuración del sensor DHT
#define DHTPIN 15        // Pin donde está conectado el sensor DHT (cambia según tu conexión)
#define DHTTYPE DHT11   // Tipo de sensor DHT (DHT11, DHT22, DHT21)
DHT dht(DHTPIN, DHTTYPE);

const char* ssids[] = {""};
const char* passwords[] = {""};

Esp32OTA esp(
  "ad11f935a9c74146a4d2e647921bf024.s1.eu.hivemq.cloud", 1883,
  "Augustodelcampo97", "Augustodelcampo97",
  STATION_NAME, "v1.0.1"
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
  esp.setLocation(DEFAULT_LATITUDE, DEFAULT_LONGITUDE);
  esp.setStationMacOverride(STATION_MAC_OVERRIDE);
  esp.setSendIntervalDefault(DEFAULT_SEND_INTERVAL_SECONDS);
  // Load persisted metadata after the sketch's fallback location is configured.
  esp.begin();
  weatherDelivery.begin(millis());
  
  lastSensorRead = millis() - 10000UL;
  Serial.println("Setup complete: first valid weather sample is due when WiFi is ready; MQTT for OTA.");
}

void loop() {
  esp.loop();
  const unsigned long now = millis();
  weatherDelivery.network(esp.networkReady());
  weatherDelivery.setIntervalSeconds(esp.sendIntervalSeconds(), now);
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
