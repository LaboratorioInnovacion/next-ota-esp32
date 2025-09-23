#include "Esp32OTA.h"

Esp32OTA::Esp32OTA(const char* mqttHost, int mqttPort,
                   const char* mqttUser, const char* mqttPass,
                   const char* deviceName, const char* firmwareVersion)
  : _mqttHost(mqttHost), _mqttPort(mqttPort),
    _mqttUser(mqttUser), _mqttPass(mqttPass),
    _deviceName(deviceName), _firmwareVersion(firmwareVersion),
    mqttClient(wifiClient)
{
  wifiList = nullptr;
  wifiCount = 0;
  currentWifiIndex = 0;
  lastHeartbeat = 0;
  otaUpdateCallback = nullptr;
}

void Esp32OTA::addWiFi(const char* ssid, const char* password) {
  // realloc simple (no STL) para compatibilidad Arduino
  WiFiCred* newList = (WiFiCred*) realloc(wifiList, sizeof(WiFiCred) * (wifiCount + 1));
  if (newList == nullptr) {
    Serial.println("No se pudo reservar memoria para credenciales WiFi");
    return;
  }
  wifiList = newList;
  wifiList[wifiCount].ssid = ssid;
  wifiList[wifiCount].pass = password;
  wifiCount++;
  Serial.printf("WiFi agregado: %s (total: %d)\n", ssid, (int)wifiCount);
}

void Esp32OTA::begin() {
  Serial.begin(115200);
  delay(500);
  deviceMac = WiFi.macAddress();
  Serial.println("MAC: " + deviceMac);

  // configurar MQTT client (SSL insecure para demo)
  wifiClient.setInsecure();
  mqttClient.setClient(wifiClient);
  mqttClient.setServer(_mqttHost, _mqttPort);
  mqttClient.setCallback([this](char* topic, byte* payload, unsigned int length){
    this->mqttCallback(topic, payload, length);
  });

  // Intentar conexión WiFi inicial (no reiniciar si falla)
  if (wifiCount > 0) {
    bool ok = connectWiFi();
    if (ok) {
      Serial.println("WiFi conectado en begin: " + WiFi.localIP().toString());
    } else {
      Serial.println("No se conectó a ninguna WiFi en begin. Seguirá intentando en loop().");
    }
  } else {
    Serial.println("No hay redes WiFi configuradas. Usa addWiFi()");
  }

  // Si WiFi ya está conectado, conectar MQTT
  if (WiFi.status() == WL_CONNECTED) {
    connectMQTT();
  }
}

bool Esp32OTA::connectWiFi() {
  if (wifiCount == 0) return false;

  unsigned long startAll = millis();
  // Intentamos cada red una vez (con timeout por red), hasta que nos conectemos
  for (size_t i = 0; i < wifiCount; ++i) {
    size_t idx = (currentWifiIndex + i) % wifiCount;
    const char* ssid = wifiList[idx].ssid;
    const char* pass = wifiList[idx].pass;

    Serial.printf("Intentando WiFi [%d/%d]: %s\n", (int)(i+1), (int)wifiCount, ssid);
    WiFi.disconnect(true); // limpiar
    delay(100);
    WiFi.begin(ssid, pass);

    unsigned long start = millis();
    while (millis() - start < perNetworkTimeout) {
      if (WiFi.status() == WL_CONNECTED) {
        currentWifiIndex = idx; // guardar índice de la red que funcionó
        Serial.println("Conectado a WiFi: " + WiFi.localIP().toString());
        return true;
      }
      delay(200);
    }
    Serial.println("Timeout para SSID: " + String(ssid));
  }

  // Si llegamos acá no se conectó a ninguna
  Serial.println("No se pudo conectar a ninguna red configurada.");
  // actualizamos índice para que en el próximo intento empiece desde la siguiente red
  currentWifiIndex = (currentWifiIndex + 1) % wifiCount;
  lastWiFiAttempt = millis();
  return false;
}

void Esp32OTA::forceConnectWiFi() {
  // Forzamos intento inmediato (usa con moderación)
  connectWiFi();
}

void Esp32OTA::connectMQTT() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("No hay WiFi. Omitiendo intento MQTT hasta reconexión.");
    return;
  }

  String clientId = "ESP32_" + deviceMac;
  String willMessage = "{\"mac\":\"" + deviceMac + "\",\"name\":\"" + _deviceName + "\",\"status\":\"offline\"}";

  // reconexión con backoff simple
  if (millis() - lastMqttAttempt < mqttReconnectInterval) return;
  lastMqttAttempt = millis();

  Serial.println("Conectando a MQTT...");
  if(mqttClient.connect(clientId.c_str(), _mqttUser, _mqttPass,
                       TOPIC_STATUS, 0, false, willMessage.c_str())) {
    Serial.println("Conectado a MQTT.");
    // Publicar estado online junto con la versión del firmware
    String onlineMsg = "{\"mac\":\"" + deviceMac + "\",\"name\":\"" + _deviceName +
                       "\",\"status\":\"ONLINE\",\"version\":\"" + _firmwareVersion + "\"}";
    mqttClient.publish(TOPIC_STATUS, onlineMsg.c_str(), false);
    mqttClient.subscribe(TOPIC_UPDATE);
    // resetear backoff a valor base
    mqttReconnectInterval = 2000;
  } else {
    Serial.print("Fallo MQTT, estado: ");
    Serial.println(mqttClient.state());
    // backoff exponencial con tope
    mqttReconnectInterval = min<unsigned long>(60000, mqttReconnectInterval * 2);
    Serial.printf("Siguiente intento MQTT en %lu ms\n", mqttReconnectInterval);
  }
}

void Esp32OTA::mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg;
  for(unsigned int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }
  Serial.println("Mensaje en " + String(topic) + ": " + msg);

  // Se espera el formato: "<MAC>|<URL>" o "all|<URL>"
  int sepIndex = msg.indexOf('|');
  if(sepIndex < 0) return;
  String targetId = msg.substring(0, sepIndex);
  String firmwareUrl = msg.substring(sepIndex + 1);

  if((targetId == deviceMac || targetId == "all") && firmwareUrl.startsWith("http")) {
    Serial.println("Iniciando OTA con URL: " + firmwareUrl);
    doOTA(firmwareUrl);
    if(otaUpdateCallback) {
      otaUpdateCallback(firmwareUrl);
    }
  }
}

void Esp32OTA::doOTA(const String &url) {
  Serial.println("[OTA] Descargando firmware desde: " + url);
  HTTPClient http;
  http.begin(url);
  int httpCode = http.GET();
  if(httpCode == 200) {
    int contentLength = http.getSize();
    WiFiClient *stream = http.getStreamPtr();
    if(contentLength > 0 && Update.begin(contentLength)) {
      size_t written = Update.writeStream(*stream);
      if(written == contentLength && Update.end(true)) {
        Serial.println("[OTA] Actualización exitosa. Reiniciando...");
        ESP.restart();
      } else {
        Serial.println("[OTA] Error al escribir firmware.");
        Update.end();
      }
    } else {
      Serial.println("[OTA] Error: tamaño inválido o no se pudo iniciar Update.");
    }
  } else {
    Serial.printf("[OTA] HTTP error: %d\n", httpCode);
  }
  http.end();
}

void Esp32OTA::sendSensorData(float temperature, float humidity) {
  String sensorMsg = "{\"mac\":\"" + deviceMac + "\",\"name\":\"" + _deviceName + "\",\"temperature\":" + String(temperature, 1) + ",\"humidity\":" + String(humidity, 1) + "}";
  mqttClient.publish(TOPIC_SENSOR, sensorMsg.c_str(), false);
  Serial.println("Sensor data enviado: " + sensorMsg);
}

void Esp32OTA::sendHeartbeat() {
  String hbMsg = "{\"mac\":\"" + deviceMac + "\",\"name\":\"" + _deviceName +
                 "\",\"uptime\":" + String(millis()) + "}";
  mqttClient.publish(TOPIC_HEARTBEAT, hbMsg.c_str(), false);
  Serial.println("Heartbeat enviado: " + hbMsg);
}

void Esp32OTA::loop() {
  // WiFi: intentar reconectar periódicamente si esta caído
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastWiFiAttempt > wifiAttemptInterval) {
      Serial.println("WiFi desconectado. Intentando reconectar...");
      lastWiFiAttempt = millis();
      connectWiFi();
    }
  }

  // MQTT: asegurar conexión si WiFi ok
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqttClient.connected()) {
      connectMQTT();
    } else {
      mqttClient.loop();
    }
  }

  // Heartbeat periódico
  if(millis() - lastHeartbeat > 60000) {
    if (mqttClient.connected()) sendHeartbeat();
    lastHeartbeat = millis();
  }
}

void Esp32OTA::setOTAUpdateCallback(void (*callback)(const String&)) {
  otaUpdateCallback = callback;
}
