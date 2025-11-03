#include "Esp32OTA.h"
#include "DHT.h"

// Configuración del sensor DHT
#define DHTPIN 15        // Pin donde está conectado el sensor DHT (cambia según tu conexión)
#define DHTTYPE DHT11   // Tipo de sensor DHT (DHT11, DHT22, DHT21)
DHT dht(DHTPIN, DHTTYPE);

const char* ssids[] = {"Auditorio Nodo", "PB02", "PB202"};
const char* passwords[] = {"auditorio.nodo", "12345678", "12345678"};

Esp32OTA esp(
  "ad11f935a9c74146a4d2e647921bf024.s1.eu.hivemq.cloud", 1883,
  "Augustodelcampo97", "Augustodelcampo97",
  "ESP32_Meteo", "v1.0.1"
);

// Variables para controlar el envío de datos
unsigned long lastHttpSent = 0;
const unsigned long HTTP_INTERVAL = 1 * 60 * 1000; // 1 minuto en milisegundos (solo HTTP)

void setup() {
  Serial.begin(115200);
  Serial.println("🚀 Iniciando ESP32 Meteo Station...");
  
  dht.begin();
  esp.setWiFiNetworks(ssids, passwords, 3);
  esp.begin();
    // 👉 Establecer ubicación geográfica
  esp.setLocation(-28.4696, -65.7852); // Catamarca, Argentina
  lastHttpSent = millis(); // Inicializar el timestamp
  
  Serial.println("✅ Setup completado - HTTP cada minuto, MQTT solo para OTA");
}

void loop() {
  // 1. Leer sensores (prioridad máxima)
  float temp = dht.readTemperature();
  float hum  = dht.readHumidity();

  if (!isnan(temp) && !isnan(hum)) {
    // 2. Envío por HTTP (funciona independientemente de MQTT)
    if (millis() - lastHttpSent >= HTTP_INTERVAL) {
      Serial.printf("📊 T: %.1f°C, H: %.1f%% - Enviando HTTP...\n", temp, hum);
      esp.sendWeatherData(temp, hum, "https://next-ota-esp32.vercel.app/api/weather");
      lastHttpSent = millis();
      Serial.println("✅ HTTP enviado!");
    }
  } else {
    Serial.println("❌ Error sensor DHT22");
  }

  // 3. MQTT solo para OTA (ahora no-bloqueante)
  static unsigned long lastMqttCheck = 0;
  if (millis() - lastMqttCheck > 60000) { // Cada minuto
    Serial.println("🔍 Verificando MQTT para OTA...");
    esp.loop(); // Ahora es no-bloqueante gracias a los cambios en Esp32OTA.cpp
    lastMqttCheck = millis();
  }
  
  delay(10000); // 10 segundos entre loops
}