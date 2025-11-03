#ifndef ESP32_OTA_H
#define ESP32_OTA_H

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <HTTPClient.h>
#include <Update.h>

// Definiciones para tópicos MQTT
#define TOPIC_STATUS    "esp32/status"
#define TOPIC_UPDATE    "esp32/update"
#define TOPIC_HEARTBEAT "esp32/heartbeat"
#define TOPIC_SENSOR    "esp32/sensor"

class Esp32OTA {
public:
  // Constructor: recibe credenciales WiFi, datos del broker MQTT, nombre del dispositivo y versión del firmware.
  Esp32OTA(const char* mqttHost, int mqttPort,
           const char* mqttUser, const char* mqttPass,
           const char* deviceName, const char* firmwareVersion);
  // Permite configurar la ubicación geográfica
  void setLocation(float lat, float lon);
  // Inicializa la conexión WiFi y MQTT, y obtiene la MAC.
  void begin();

  // Llamar en el loop() principal para gestionar MQTT y enviar heartbeats.
  void loop();

  // Permite establecer un callback para notificar cuando se inicia una actualización OTA.
  void setOTAUpdateCallback(void (*callback)(const String&));

  // Envía manualmente un heartbeat.
  void sendHeartbeat();

  // Envía datos de temperatura y humedad por MQTT
  void sendSensorData(float temperature, float humidity);

  // Envía datos meteorológicos por POST
  void sendWeatherData(float temperature, float humidity, const char* endpointUrl);

  // Permite configurar múltiples redes WiFi
  void setWiFiNetworks(const char* ssids[], const char* passwords[], int count);

private:
  void connectWiFi();
  void connectMQTT();
  void mqttCallback(char* topic, byte* payload, unsigned int length);
  void doOTA(const String &url);
  float _latitude = 0.0;
  float _longitude = 0.0;
  const char* _mqttHost;
  int         _mqttPort;
  const char* _mqttUser;
  const char* _mqttPass;
  const char* _deviceName;
  const char* _firmwareVersion;

  String deviceMac;
  WiFiClientSecure wifiClient;
  PubSubClient mqttClient;

  unsigned long lastHeartbeat;
  void (*otaUpdateCallback)(const String&);  // Callback opcional para notificar actualizaciones OTA

  // Redes WiFi
  const char** _ssids;
  const char** _passwords;
  int _wifiCount;
};

#endif

// #ifndef ESP32_OTA_H
// #define ESP32_OTA_H

// #include <WiFi.h>
// #include <WiFiClientSecure.h>
// #include <PubSubClient.h>
// #include <HTTPClient.h>
// #include <Update.h>

// // Definiciones para tópicos MQTT
// #define TOPIC_STATUS    "esp32/status"
// #define TOPIC_UPDATE    "esp32/update"
// #define TOPIC_HEARTBEAT "esp32/heartbeat"

// class Esp32OTA {
// public:
//   // Constructor: recibe credenciales WiFi, datos del broker MQTT, nombre del dispositivo y versión del firmware.
//   Esp32OTA(const char* ssid, const char* password,
//            const char* mqttHost, int mqttPort,
//            const char* mqttUser, const char* mqttPass,
//            const char* deviceName, const char* firmwareVersion);

//   // Inicializa la conexión WiFi y MQTT, y obtiene la MAC.
//   void begin();

//   // Llamar en el loop() principal para gestionar MQTT y enviar heartbeats.
//   void loop();

//   // Permite establecer un callback para notificar cuando se inicia una actualización OTA.
//   void setOTAUpdateCallback(void (*callback)(const String&));


//   // Envía manualmente un heartbeat.
//   void sendHeartbeat();

//   // Envía datos de temperatura y humedad por MQTT
//   void sendSensorData(float temperature, float humidity);

// private:
//   void connectWiFi();
//   void connectMQTT();
//   void mqttCallback(char* topic, byte* payload, unsigned int length);
//   void doOTA(const String &url);

//   const char* _ssid;
//   const char* _password;
//   const char* _mqttHost;
//   int         _mqttPort;
//   const char* _mqttUser;
//   const char* _mqttPass;
//   const char* _deviceName;
//   const char* _firmwareVersion;

//   String deviceMac;
//   WiFiClientSecure wifiClient;
//   PubSubClient mqttClient;

//   unsigned long lastHeartbeat;
//   void (*otaUpdateCallback)(const String&);  // Callback opcional para notificar actualizaciones OTA
//   void sendWeatherData(float temperature, float humidity, const char* endpointUrl);

// };


// #endif
