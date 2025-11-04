#include "Esp32OTA.h"
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
  _ssids = nullptr;
  _passwords = nullptr;
  _wifiCount = 0;
}

void Esp32OTA::setWiFiNetworks(const char* ssids[], const char* passwords[], int count) {
  _ssids = ssids;
  _passwords = passwords;
  _wifiCount = count;
}

void Esp32OTA::begin() {
  Serial.begin(115200);
  delay(1000);
  connectWiFi();
  deviceMac = WiFi.macAddress();
  Serial.println("MAC: " + deviceMac);

  // Configurar cliente MQTT
  wifiClient.setInsecure();
  mqttClient.setServer(_mqttHost, _mqttPort);
  mqttClient.setCallback([this](char* topic, byte* payload, unsigned int length) {
    this->mqttCallback(topic, payload, length);
  });
  connectMQTT();
}

void Esp32OTA::connectWiFi() {
  if (_wifiCount == 0) {
    Serial.println("⚠️ No hay redes WiFi configuradas.");
    return;
  }

  Serial.println("Conectando a WiFi...");

  for (int i = 0; i < _wifiCount; i++) {
    Serial.printf("Intentando conectar a %s...\n", _ssids[i]);
    WiFi.begin(_ssids[i], _passwords[i]);
    int retries = 0;
    while (WiFi.status() != WL_CONNECTED && retries < 20) {
      delay(500);
      Serial.print(".");
      retries++;
    }
    if (WiFi.status() == WL_CONNECTED) {
      Serial.printf("\n✅ Conectado a %s, IP: %s\n", _ssids[i], WiFi.localIP().toString().c_str());
      return;
    }
    WiFi.disconnect(true);
  }

  Serial.println("\n❌ No se pudo conectar a ninguna red. Reiniciando...");
  ESP.restart();
}

void Esp32OTA::connectMQTT() {
  String clientId = "ESP32_" + deviceMac;
  String willMessage = "{\"mac\":\"" + deviceMac + "\",\"name\":\"" + _deviceName + "\",\"status\":\"offline\"}";

  // Solo UN intento, no bucle infinito
  if (!mqttClient.connected()) {
    Serial.println("🔄 Intento de conexión MQTT...");
    if (mqttClient.connect(clientId.c_str(), _mqttUser, _mqttPass,
                           TOPIC_STATUS, 0, false, willMessage.c_str())) {
      Serial.println("✅ MQTT conectado para OTA.");
      String onlineMsg = "{\"mac\":\"" + deviceMac + "\",\"name\":\"" + _deviceName +
                         "\",\"status\":\"ONLINE\",\"version\":\"" + _firmwareVersion + "\"}";
      mqttClient.publish(TOPIC_STATUS, onlineMsg.c_str(), false);
      mqttClient.subscribe(TOPIC_UPDATE);
    } else {
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

void Esp32OTA::sendWeatherData(float temperature, float humidity, const char* endpointUrl) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("No hay WiFi para enviar POST");
    return;
  }

  HTTPClient http;
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
  if (httpCode > 0) {
    Serial.printf("POST enviado (%d): %s\n", httpCode, payload.c_str());
  } else {
    Serial.printf("Error POST: %s\n", http.errorToString(httpCode).c_str());
  }
  http.end();
}

void Esp32OTA::sendHeartbeat() {
  String hbMsg = "{\"mac\":\"" + deviceMac + "\",\"name\":\"" + _deviceName +
                 "\",\"uptime\":" + String(millis()) + "}";
  mqttClient.publish(TOPIC_HEARTBEAT, hbMsg.c_str(), false);
  Serial.println("Heartbeat enviado: " + hbMsg);
}

void Esp32OTA::loop() {
  // Solo intentar conectar si no está conectado (sin bloquear)
  static unsigned long lastConnectAttempt = 0;
  
  if (!mqttClient.connected()) {
    // Solo intentar reconectar cada 30 segundos
    if (millis() - lastConnectAttempt > 30000) {
      connectMQTT();
      lastConnectAttempt = millis();
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

