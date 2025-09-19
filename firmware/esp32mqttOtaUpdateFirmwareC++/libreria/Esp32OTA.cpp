#include "Esp32OTA.h"

Esp32OTA::Esp32OTA(const char* ssid, const char* password,
                   const char* mqttHost, int mqttPort,
                   const char* mqttUser, const char* mqttPass,
                   const char* deviceName, const char* firmwareVersion)
  : _ssid(ssid), _password(password),
    _mqttHost(mqttHost), _mqttPort(mqttPort),
    _mqttUser(mqttUser), _mqttPass(mqttPass),
    _deviceName(deviceName), _firmwareVersion(firmwareVersion),
    mqttClient(wifiClient)
{
  lastHeartbeat = 0;
  otaUpdateCallback = nullptr;
}

void Esp32OTA::begin() {
  Serial.begin(115200);
  delay(1000);
  connectWiFi();
  deviceMac = WiFi.macAddress();
  Serial.println("MAC: " + deviceMac);

  // Configurar cliente MQTT seguro (para demo se deshabilita la validación del certificado)
  wifiClient.setInsecure();
  mqttClient.setServer(_mqttHost, _mqttPort);
  mqttClient.setCallback([this](char* topic, byte* payload, unsigned int length){
    this->mqttCallback(topic, payload, length);
  });
  connectMQTT();
}

void Esp32OTA::connectWiFi() {
  Serial.print("Conectando a WiFi...");
  WiFi.begin(_ssid, _password);
  int retries = 0;
  while(WiFi.status() != WL_CONNECTED && retries < 20) {
    delay(500);
    Serial.print(".");
    retries++;
  }
  if(WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi conectado: " + WiFi.localIP().toString());
  } else {
    Serial.println("\nError de WiFi. Reiniciando...");
    ESP.restart();
  }
}

void Esp32OTA::connectMQTT() {
  String clientId = "ESP32_" + deviceMac;
  String willMessage = "{\"mac\":\"" + deviceMac + "\",\"name\":\"" + _deviceName + "\",\"status\":\"offline\"}";
  
  while(!mqttClient.connected()) {
    Serial.println("Conectando a MQTT...");
    if(mqttClient.connect(clientId.c_str(), _mqttUser, _mqttPass,
                            TOPIC_STATUS, 0, false, willMessage.c_str())) {
      Serial.println("Conectado a MQTT.");
      // Publicar estado online junto con la versión del firmware
      String onlineMsg = "{\"mac\":\"" + deviceMac + "\",\"name\":\"" + _deviceName +
                         "\",\"status\":\"online\",\"version\":\"" + _firmwareVersion + "\"}";
      mqttClient.publish(TOPIC_STATUS, onlineMsg.c_str(), false);
      // Suscribirse al tópico para recibir comandos OTA
      mqttClient.subscribe(TOPIC_UPDATE);
    } else {
      Serial.print("Fallo MQTT, estado: ");
      Serial.println(mqttClient.state());
      delay(2000);
    }
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
      }
    } else {
      Serial.println("[OTA] Error: tamaño inválido.");
    }
  } else {
    Serial.printf("[OTA] HTTP error: %d\n", httpCode);
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
  if(!mqttClient.connected()) {
    connectMQTT();
  }
  mqttClient.loop();
  if(millis() - lastHeartbeat > 60000) {
    sendHeartbeat();
    lastHeartbeat = millis();
  }
}

void Esp32OTA::setOTAUpdateCallback(void (*callback)(const String&)) {
  otaUpdateCallback = callback;
}
