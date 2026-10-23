#include "Esp32OTA.h"
#include "DiagnosticsConfig.h"
#include "DiagnosticsPolicy.h"
#include <time.h>
#include <esp_system.h>
#include <esp_sntp.h>

namespace {
volatile bool diagnosticsTimeReceived = false;
void diagnosticsTimeSync(struct timeval*) { diagnosticsTimeReceived = true; }

String diagnosticJsonString(const char* value) {
  String result;
  for (size_t i = 0; value[i] && i < 64; ++i) {
    const unsigned char c = value[i];
    if (c == '"' || c == '\\') result += '\\';
    if (c >= 32 && c < 127) result += char(c);
  }
  return result;
}
}

bool Esp32OTA::diagnosticsReady() {
  const bool configured = diagnostics::configured(ESP32_DIAGNOSTICS_TOKEN,
      ESP32_DIAGNOSTICS_ROOT_CA, ESP32_DIAGNOSTICS_TLS_APPROVED);
  if (!configured) {
    static bool reported = false;
    if (!reported) Serial.println("Diagnostics disabled: dedicated token, trusted CA and TLS approval required.");
    reported = true;
    return false;
  }
  if (!networkReady()) return false;
  if (!diagnosticsClockStarted) {
    diagnosticsClockStarted = true;
    sntp_set_time_sync_notification_cb(diagnosticsTimeSync);
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    Serial.println("Diagnostics pending asynchronous clock synchronization.");
  }
  // No blocking NTP wait. A plausible epoch alone is not a synchronization signal.
  diagnosticsClockSynced = diagnostics::clockReady(diagnosticsTimeReceived, time(nullptr));
  return diagnosticsClockSynced;
}

int Esp32OTA::sendDiagnostics(const char* endpoint, const char* sensorStatus,
                             const char* errorCode, uint64_t uptimeMs) {
  if (!diagnosticsReady() || uptimeMs > 9007199254740991ULL) return -1;
  if (diagnosticsBootId.isEmpty()) {
    char boot[17];
    snprintf(boot, sizeof(boot), "%08lx%08lx", (unsigned long)esp_random(), (unsigned long)esp_random());
    diagnosticsBootId = boot;
  }
  char uptime[24];
  snprintf(uptime, sizeof(uptime), "%llu", (unsigned long long)uptimeMs);
  String payload = "{\"mac\":\"" + deviceMac + "\",\"name\":\"" + diagnosticJsonString(_deviceName) +
      "\",\"version\":\"" + diagnosticJsonString(_firmwareVersion) + "\",\"bootId\":\"" + diagnosticsBootId +
      "\",\"uptimeMs\":" + uptime + ",\"sensorStatus\":\"" + sensorStatus + "\",\"errorCode\":\"" + errorCode + "\"}";
  // Dedicated verified transport; never share the legacy convenience client.
  WiFiClientSecure tls;
  tls.setCACert(ESP32_DIAGNOSTICS_ROOT_CA);
  tls.setHandshakeTimeout(3);
  HTTPClient http;
  http.setConnectTimeout(3000);
  http.setTimeout(3000);
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  if (!http.begin(tls, endpoint)) return -1;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + ESP32_DIAGNOSTICS_TOKEN);
  const int code = http.POST(payload);
  http.end();
  Serial.printf("Diagnostics HTTP/transport code: %d\n", code);
  return code;
}
void Esp32OTA::setLocation(float lat, float lon) {
  _latitude = lat;
  _longitude = lon;
}

Esp32OTA::Esp32OTA(const char* mqttHost, int mqttPort,
                   const char* mqttUser, const char* mqttPass,
                   const char* deviceName, const char* firmwareVersion)
  : _mqttHost(mqttHost), _mqttPort(mqttPort),
    _mqttUser(mqttUser), _mqttPass(mqttPass),
    _deviceName(deviceName), _firmwareVersion(firmwareVersion),
    mqttClient(wifiClient)
{
  lastHeartbeat = 0;
  otaUpdateCallback = nullptr;
}

void Esp32OTA::setWiFiNetworks(const char* ssids[], const char* passwords[], int count) {
  provisioning.setNetworks(ssids, passwords, count);
}

void Esp32OTA::begin() {
  Serial.begin(115200);
  provisioning.begin();
  deviceMac = WiFi.macAddress();
  Serial.println("MAC: " + deviceMac);

  // Configurar cliente MQTT
  wifiClient.setInsecure();
  wifiClient.setHandshakeTimeout(5);
  mqttClient.setSocketTimeout(5);
  mqttClient.setServer(_mqttHost, _mqttPort);
  mqttClient.setCallback([this](char* topic, byte* payload, unsigned int length) {
    this->mqttCallback(topic, payload, length);
  });
  lastConnectAttempt = millis() - 30000UL;
}

void Esp32OTA::connectMQTT() {
  String clientId = "ESP32_" + deviceMac;
  String willMessage = "{\"mac\":\"" + deviceMac + "\",\"name\":\"" + _deviceName + "\",\"status\":\"offline\"}";

  // Solo UN intento, no bucle infinito
  if (!mqttClient.connected()) {
    Serial.println("🔄 Intento de conexión MQTT...");
    // This overload takes milliseconds in both Arduino-ESP32 2.x and 3.x.
    // DNS resolution remains subject to the core's resolver timeout.
    if (!wifiClient.connected() && !wifiClient.connect(_mqttHost, _mqttPort, 5000)) {
      wifiClient.stop();
      Serial.println("MQTT transport unavailable; retry deferred.");
      return;
    }
    if (mqttClient.connect(clientId.c_str(), _mqttUser, _mqttPass,
                           TOPIC_STATUS, 0, false, willMessage.c_str())) {
      Serial.println("✅ MQTT conectado para OTA.");
      String onlineMsg = "{\"mac\":\"" + deviceMac + "\",\"name\":\"" + _deviceName +
                         "\",\"status\":\"ONLINE\",\"version\":\"" + _firmwareVersion + "\"}";
      mqttClient.publish(TOPIC_STATUS, onlineMsg.c_str(), false);
      mqttClient.subscribe(TOPIC_UPDATE);
    } else {
      wifiClient.stop();
      Serial.printf("⚠️ Fallo MQTT (estado: %d) - Continuando solo con HTTP\n", mqttClient.state());
      // NO hacer delay ni reintentar automáticamente
    }
  }
}

void Esp32OTA::mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  Serial.println("Mensaje en " + String(topic) + ": " + msg);

  int sepIndex = msg.indexOf('|');
  if (sepIndex < 0) return;

  String targetId = msg.substring(0, sepIndex);
  String firmwareUrl = msg.substring(sepIndex + 1);

  if ((targetId == deviceMac || targetId == "all") && firmwareUrl.startsWith("http")) {
    Serial.println("Iniciando OTA con URL: " + firmwareUrl);
    doOTA(firmwareUrl);
    if (otaUpdateCallback) otaUpdateCallback(firmwareUrl);
  }
}

void Esp32OTA::doOTA(const String &url) {
  Serial.println("[OTA] Descargando firmware desde: " + url);
  HTTPClient http;
  http.setConnectTimeout(5000);
  http.setTimeout(5000);
  http.begin(url);
  int httpCode = http.GET();
  if (httpCode == 200) {
    int contentLength = http.getSize();
    WiFiClient *stream = http.getStreamPtr();
    if (contentLength > 0 && Update.begin(contentLength)) {
      size_t written = Update.writeStream(*stream);
      if (written == contentLength && Update.end(true)) {
        Serial.println("[OTA] ✅ Actualización exitosa. Reiniciando...");
        ESP.restart();
      } else {
        Serial.println("[OTA] ❌ Error al escribir firmware.");
      }
    } else {
      Serial.println("[OTA] ❌ Tamaño inválido.");
    }
  } else {
    Serial.printf("[OTA] HTTP error: %d\n", httpCode);
  }
  http.end();
}

void Esp32OTA::sendSensorData(float temperature, float humidity) {
  String sensorMsg = "{\"mac\":\"" + deviceMac + "\",\"name\":\"" + _deviceName +
                     "\",\"temperature\":" + String(temperature, 1) +
                     ",\"humidity\":" + String(humidity, 1) + "}";
  mqttClient.publish(TOPIC_SENSOR, sensorMsg.c_str(), false);
  Serial.println("Sensor data enviado: " + sensorMsg);
}

bool Esp32OTA::sendWeatherData(float temperature, float humidity, const char* endpointUrl) {
  if (!networkReady()) {
    Serial.println("No hay WiFi para enviar POST");
    return false;
  }

  HTTPClient http;
  http.setConnectTimeout(5000);
  http.setTimeout(5000);
  http.begin(endpointUrl);
  http.addHeader("Content-Type", "application/json");

  // String payload = "{\"mac\":\"" + deviceMac + "\",\"name\":\"" + _deviceName +
  //                  "\",\"version\":\"" + _firmwareVersion +
  //                  "\",\"temperature\":" + String(temperature, 1) +
  //                  ",\"humidity\":" + String(humidity, 1) + "}";
String payload = "{\"mac\":\"" + deviceMac + "\",\"name\":\"" + _deviceName +
                 "\",\"version\":\"" + _firmwareVersion +
                 "\",\"temperature\":" + String(temperature, 1) +
                 ",\"humidity\":" + String(humidity, 1) +
                 ",\"lat\":" + String(_latitude, 6) +
                 ",\"lon\":" + String(_longitude, 6) + "}";

  int httpCode = http.POST(payload);
  const bool success = httpCode >= 200 && httpCode < 300;
  if (success) {
    Serial.printf("POST enviado (%d): %s\n", httpCode, payload.c_str());
  } else {
    Serial.printf("POST failed (HTTP/transport code: %d)\n", httpCode);
  }
  http.end();
  return success;
}

void Esp32OTA::sendHeartbeat() {
  String hbMsg = "{\"mac\":\"" + deviceMac + "\",\"name\":\"" + _deviceName +
                 "\",\"uptime\":" + String(millis()) + "}";
  mqttClient.publish(TOPIC_HEARTBEAT, hbMsg.c_str(), false);
  Serial.println("Heartbeat enviado: " + hbMsg);
}

void Esp32OTA::loop() {
  provisioning.loop();
  // Synchronous upstream work is suspended while setup is active.
  if (!networkReady()) {
    wifiClient.stop();
    return;
  }
  
  if (!mqttClient.connected()) {
    // Solo intentar reconectar cada 30 segundos
    if (millis() - lastConnectAttempt > 30000) {
      lastConnectAttempt = millis();
      connectMQTT();
    }
  } else {
    // Solo procesar MQTT si está conectado
    mqttClient.loop();
    
    // Enviar heartbeat solo si está conectado
    if (millis() - lastHeartbeat > 60000) {
      sendHeartbeat();
      lastHeartbeat = millis();
    }
  }
}

void Esp32OTA::setOTAUpdateCallback(void (*callback)(const String&)) {
  otaUpdateCallback = callback;
}

// #include "Esp32OTA.h"
// #define TOPIC_SENSOR "esp32/sensor"

// void Esp32OTA::sendSensorData(float temperature, float humidity) {
//   String sensorMsg = "{\"mac\":\"" + deviceMac + "\",\"name\":\"" + _deviceName + "\",\"temperature\":" + String(temperature, 1) + ",\"humidity\":" + String(humidity, 1) + "}";
//   mqttClient.publish(TOPIC_SENSOR, sensorMsg.c_str(), false);
//   Serial.println("Sensor data enviado: " + sensorMsg);
// }

// Esp32OTA::Esp32OTA(const char* ssid, const char* password,
//                    const char* mqttHost, int mqttPort,
//                    const char* mqttUser, const char* mqttPass,
//                    const char* deviceName, const char* firmwareVersion)
//   : _ssid(ssid), _password(password),
//     _mqttHost(mqttHost), _mqttPort(mqttPort),
//     _mqttUser(mqttUser), _mqttPass(mqttPass),
//     _deviceName(deviceName), _firmwareVersion(firmwareVersion),
//     mqttClient(wifiClient)
// {
//   lastHeartbeat = 0;
//   otaUpdateCallback = nullptr;
// }

// void Esp32OTA::begin() {
//   Serial.begin(115200);
//   delay(1000);
//   connectWiFi();
//   deviceMac = WiFi.macAddress();
//   Serial.println("MAC: " + deviceMac);

//   // Configurar cliente MQTT seguro (para demo se deshabilita la validación del certificado)
//   wifiClient.setInsecure();
//   mqttClient.setServer(_mqttHost, _mqttPort);
//   mqttClient.setCallback([this](char* topic, byte* payload, unsigned int length){
//     this->mqttCallback(topic, payload, length);
//   });
//   connectMQTT();
// }
// void Esp32OTA::connectWiFi() {
//   struct WifiNetwork {
//     const char* ssid;
//     const char* password;
//   };

//   WifiNetwork networks[] = {
//     {"Auditorio Nodo", "auditorio.nodo"},
//     {"PB02", "12345678"},
//     {"PB202", "12345678"}
//   };

//   Serial.println("Conectando a WiFi...");

//   for (auto &net : networks) {
//     Serial.printf("Intentando conectar a %s...\n", net.ssid);
//     WiFi.begin(net.ssid, net.password);
//     int retries = 0;
//     while (WiFi.status() != WL_CONNECTED && retries < 20) {
//       delay(500);
//       Serial.print(".");
//       retries++;
//     }
//     if (WiFi.status() == WL_CONNECTED) {
//       Serial.printf("\nConectado a %s, IP: %s\n", net.ssid, WiFi.localIP().toString().c_str());
//       return;
//     }
//     WiFi.disconnect(true);
//   }

//   Serial.println("\nNo se pudo conectar a ninguna red. Reiniciando...");
//   ESP.restart();
// }
// void Esp32OTA::sendWeatherData(float temperature, float humidity, const char* endpointUrl) {
//   if (WiFi.status() != WL_CONNECTED) {
//     Serial.println("No hay WiFi para enviar POST");
//     return;
//   }

//   HTTPClient http;
//   http.begin(endpointUrl);
//   http.addHeader("Content-Type", "application/json");

//   String payload = "{\"mac\":\"" + deviceMac + "\",\"name\":\"" + _deviceName +
//                    "\",\"temperature\":" + String(temperature, 1) +
//                    ",\"humidity\":" + String(humidity, 1) + "}";

//   int httpCode = http.POST(payload);
//   if (httpCode > 0) {
//     Serial.printf("POST enviado (%d): %s\n", httpCode, payload.c_str());
//   } else {
//     Serial.printf("Error POST: %s\n", http.errorToString(httpCode).c_str());
//   }
//   http.end();
// }


// // void Esp32OTA::connectWiFi() {
// //   Serial.print("Conectando a WiFi...");
// //   WiFi.begin(_ssid, _password);
// //   int retries = 0;
// //   while(WiFi.status() != WL_CONNECTED && retries < 20) {
// //     delay(500);
// //     Serial.print(".");
// //     retries++;
// //   }
// //   if(WiFi.status() == WL_CONNECTED) {
// //     Serial.println("\nWiFi conectado: " + WiFi.localIP().toString());
// //   } else {
// //     Serial.println("\nError de WiFi. Reiniciando...");
// //     ESP.restart();
// //   }
// // }

// void Esp32OTA::connectMQTT() {
//   String clientId = "ESP32_" + deviceMac;
//   String willMessage = "{\"mac\":\"" + deviceMac + "\",\"name\":\"" + _deviceName + "\",\"status\":\"offline\"}";
  
//   while(!mqttClient.connected()) {
//     Serial.println("Conectando a MQTT...");
//     if(mqttClient.connect(clientId.c_str(), _mqttUser, _mqttPass,
//                             TOPIC_STATUS, 0, false, willMessage.c_str())) {
//       Serial.println("Conectado a MQTT.");
//       // Publicar estado online junto con la versión del firmware
//       String onlineMsg = "{\"mac\":\"" + deviceMac + "\",\"name\":\"" + _deviceName +
//                          "\",\"status\":\"ONLINE\",\"version\":\"" + _firmwareVersion + "\"}";
//       mqttClient.publish(TOPIC_STATUS, onlineMsg.c_str(), false);
//       // Suscribirse al tópico para recibir comandos OTA
//       mqttClient.subscribe(TOPIC_UPDATE);
//     } else {
//       Serial.print("Fallo MQTT, estado: ");
//       Serial.println(mqttClient.state());
//       delay(2000);
//     }
//   }
// }

// void Esp32OTA::mqttCallback(char* topic, byte* payload, unsigned int length) {
//   String msg;
//   for(unsigned int i = 0; i < length; i++) {
//     msg += (char)payload[i];
//   }
//   Serial.println("Mensaje en " + String(topic) + ": " + msg);
  
//   // Se espera el formato: "<MAC>|<URL>" o "all|<URL>"
//   int sepIndex = msg.indexOf('|');
//   if(sepIndex < 0) return;
//   String targetId = msg.substring(0, sepIndex);
//   String firmwareUrl = msg.substring(sepIndex + 1);
  
//   if((targetId == deviceMac || targetId == "all") && firmwareUrl.startsWith("http")) {
//     Serial.println("Iniciando OTA con URL: " + firmwareUrl);
//     doOTA(firmwareUrl);
//     if(otaUpdateCallback) {
//       otaUpdateCallback(firmwareUrl);
//     }
//   }
// }

// void Esp32OTA::doOTA(const String &url) {
//   Serial.println("[OTA] Descargando firmware desde: " + url);
//   HTTPClient http;
//   http.begin(url);
//   int httpCode = http.GET();
//   if(httpCode == 200) {
//     int contentLength = http.getSize();
//     WiFiClient *stream = http.getStreamPtr();
//     if(contentLength > 0 && Update.begin(contentLength)) {
//       size_t written = Update.writeStream(*stream);
//       if(written == contentLength && Update.end(true)) {
//         Serial.println("[OTA] Actualización exitosa. Reiniciando...");
//         ESP.restart();
//       } else {
//         Serial.println("[OTA] Error al escribir firmware.");
//       }
//     } else {
//       Serial.println("[OTA] Error: tamaño inválido.");
//     }
//   } else {
//     Serial.printf("[OTA] HTTP error: %d\n", httpCode);
//   }
//   http.end();
// }

// void Esp32OTA::sendHeartbeat() {
//   String hbMsg = "{\"mac\":\"" + deviceMac + "\",\"name\":\"" + _deviceName +
//                  "\",\"uptime\":" + String(millis()) + "}";
//   mqttClient.publish(TOPIC_HEARTBEAT, hbMsg.c_str(), false);
//   Serial.println("Heartbeat enviado: " + hbMsg);
// }

// void Esp32OTA::loop() {
//   if(!mqttClient.connected()) {
//     connectMQTT();
//   }
//   mqttClient.loop();
//   if(millis() - lastHeartbeat > 60000) {
//     sendHeartbeat();
//     lastHeartbeat = millis();
//   }
// }

// void Esp32OTA::setOTAUpdateCallback(void (*callback)(const String&)) {
//   otaUpdateCallback = callback;
// }
