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
  // Constructor principal (puedes pasar nullptr si vas a agregar redes con addWiFi)
  Esp32OTA(const char* mqttHost, int mqttPort,
           const char* mqttUser, const char* mqttPass,
           const char* deviceName, const char* firmwareVersion);

  // Inicializa la serie, WiFi y MQTT
  void begin();

  // Llamar en loop()
  void loop();

  // Agregar credenciales WiFi (puedes llamarlo varias veces)
  void addWiFi(const char* ssid, const char* password);

  // Callback para cuando se inicia una OTA
  void setOTAUpdateCallback(void (*callback)(const String&));

  // Enviar heartbeat manual
  void sendHeartbeat();

  // Enviar sensor data
  void sendSensorData(float temperature, float humidity);

private:
  // Intentar conectar a una de las redes configuradas.
  // Non-blocking-ish: intentará redes con un timeout por red y regresa true si se conectó.
  bool connectWiFi();

  // Forzar intento inmediato de conexión WiFi (usar con precaución)
  void forceConnectWiFi();

  // MQTT
  void connectMQTT();
  void mqttCallback(char* topic, byte* payload, unsigned int length);

  // OTA
  void doOTA(const String &url);

  // Datos MQTT/Device
  const char* _mqttHost;
  int         _mqttPort;
  const char* _mqttUser;
  const char* _mqttPass;
  const char* _deviceName;
  const char* _firmwareVersion;

  // WiFi credentials storage (simple, dinámico)
  struct WiFiCred {
    const char* ssid;
    const char* pass;
  };
  WiFiCred* wifiList = nullptr;
  size_t wifiCount = 0;
  size_t currentWifiIndex = 0;

  // network attempt timing
  unsigned long lastWiFiAttempt = 0;
  unsigned long wifiAttemptInterval = 15000; // ms entre intentos de cambio/red
  unsigned long perNetworkTimeout = 7000; // ms a esperar por cada red antes de probar la siguiente

  // MQTT & clients
  String deviceMac;
  WiFiClientSecure wifiClient;
  PubSubClient mqttClient;

  // heartbeat
  unsigned long lastHeartbeat;
  void (*otaUpdateCallback)(const String&);

  // Backoff para MQTT reconexión
  unsigned long lastMqttAttempt = 0;
  unsigned long mqttReconnectInterval = 2000; // empieza en 2s, se puede aumentar
};

#endif
