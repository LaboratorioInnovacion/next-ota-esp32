#include "WiFiProvisioning.h"
#include "SetupConfig.h"
#include <esp_system.h>
#include <lwip/sockets.h>
#include <errno.h>
#include "PortalAssets.h"
#include "PortalIdentity.h"

namespace {
String randomHex() {
  uint8_t bytes[16];
  esp_fill_random(bytes, sizeof(bytes));
  const char alphabet[] = "0123456789abcdef";
  char text[33];
  for (size_t i = 0; i < sizeof(bytes); ++i) {
    text[2 * i] = alphabet[bytes[i] >> 4];
    text[2 * i + 1] = alphabet[bytes[i] & 15];
  }
  text[32] = 0;
  return String(text);
}
String slotKey(size_t slot) { return "net" + String(static_cast<unsigned int>(slot)); }
}

void WiFiProvisioning::setNetworks(const char* ssids[], const char* passwords[], int count) {
  compiledCount_ = 0;
  if (!ssids || !passwords) return;
  for (int i = 0; i < count && compiledCount_ < provisioning::MaxNetworks; ++i) {
    if (ssids[i] && passwords[i] && provisioning::assign(compiled_[compiledCount_],
        ssids[i], strlen(ssids[i]), passwords[i], strlen(passwords[i]))) ++compiledCount_;
  }
}

void WiFiProvisioning::begin() {
  // Disable the core's flash writes/reconnect policy; this module owns retries.
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false);
  storageReady_ = preferences_.begin("station-wifi", false);
  if (storageReady_) saved_.load(*this);
  metadataReady_ = metadata_.begin("station-meta", false);
  location_.load(*this);
  if (metadataReady_) stationName_.load(metadata_);
  if (metadataReady_) sendInterval_.load(metadata_);
  policy_.begin(millis(), saved_.count + compiledCount_, *this);
}

size_t WiFiProvisioning::readLocation(provisioning::LocationBlob& value) {
  if (!metadataReady_ || metadata_.getBytesLength("location") != sizeof(value)) return 0;
  return metadata_.getBytes("location", &value, sizeof(value));
}

size_t WiFiProvisioning::writeLocation(const provisioning::LocationBlob& value) {
  return metadataReady_ ? metadata_.putBytes("location", &value, sizeof(value)) : 0;
}

bool WiFiProvisioning::clearLocation() {
  if (!metadataReady_) return false;
  if (!metadata_.isKey("location")) return true;
  return metadata_.remove("location") && !metadata_.isKey("location");
}

size_t WiFiProvisioning::read(size_t slot, provisioning::Credential& value) {
  if (!storageReady_) return 0;
  const String key = slotKey(slot);
  // Existing wrong-type/invalid keys are reserved, never overwritten.
  if (!preferences_.isKey(key.c_str())) return 0;
  const size_t size = preferences_.getBytesLength(key.c_str());
  if (size != sizeof(value)) return size ? size : 1;
  return preferences_.getBytes(key.c_str(), &value, sizeof(value)) == sizeof(value) ? sizeof(value) : 1;
}

bool WiFiProvisioning::write(size_t slot, const provisioning::Credential& value) {
  return storageReady_ && preferences_.putBytes(slotKey(slot).c_str(), &value, sizeof(value)) == sizeof(value);
}

const provisioning::Credential& WiFiProvisioning::known(size_t index) const {
  return index < saved_.count ? saved_.entries[index] : compiled_[index - saved_.count];
}

void WiFiProvisioning::disconnect() { WiFi.disconnect(false, false); }

void WiFiProvisioning::connect(size_t index, bool candidate) {
  attempted_ = candidate ? candidate_ : known(index);
  WiFi.begin(attempted_.ssid, attempted_.password);
}

bool WiFiProvisioning::saveCandidate() {
  const bool saved = saved_.commit(*this, candidate_);
  policy_.setCount(saved_.count + compiledCount_);
  // Location is explicit and only committed after fresh WiFi association and
  // confirmed network storage. Failure leaves the active location unchanged.
  if (!saved) return false;
  const provisioning::Location previous = location_.value();
  provisioning::StationName previousName{};
  provisioning::parseStationName(stationName_.saved(), previousName);
  if (!location_.commit(*this, pendingLocation_)) return false;
  if (stationName_.commit(metadata_, pendingName_)) {
    if (sendInterval_.commit(metadata_, pendingSendSeconds_)) return true;
    stationName_.commit(metadata_, previousName);
  }
  location_.commit(*this, previous); // Best-effort rollback, not an NVS transaction.
  return false;
}

bool WiFiProvisioning::setupPassword() {
  if (!storageReady_) return false;
  if (provisioning::TemporarySharedSetupPassword[0]) {
    const char* configured = provisioning::selectSetupPassword(
        provisioning::TemporarySharedSetupPassword, nullptr);
    if (!configured) return false;
    apPassword_ = configured;
    return true;
  }
  if (preferences_.isKey("setup-pass")) {
    apPassword_ = preferences_.getString("setup-pass", "");
    return provisioning::selectSetupPassword(nullptr, apPassword_.c_str()) != nullptr;
  }
  const String generated = randomHex();
  if (preferences_.putString("setup-pass", generated) != generated.length()) return false;
  apPassword_ = preferences_.getString("setup-pass", "");
  return apPassword_ == generated;
}

bool WiFiProvisioning::startPortal() {
  if (!setupPassword()) {
    Serial.println("Setup unavailable: protected credential configuration/storage failed.");
    return false;
  }
  token_ = randomHex();
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char name[20];
  provisioning::setupName(name, mac);
  apName_ = name;
  if (!WiFi.mode(WIFI_AP_STA) ||
      !WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0)) ||
      !WiFi.softAP(apName_.c_str(), apPassword_.c_str(), 1, false, 1)) {
    WiFi.softAPdisconnect(false);
    WiFi.mode(WIFI_STA);
    return false;
  }
  if (!server_.begin()) {
    WiFi.softAPdisconnect(false);
    WiFi.mode(WIFI_STA);
    token_ = "";
    Serial.println("Setup unavailable: AP-only HTTP binding failed.");
    return false;
  }
  if (!dns_.start(dnsSocket_))
    Serial.println("Captive DNS unavailable: AP-only binding failed. Use http://192.168.4.1.");
  Serial.println("Local setup AP: " + apName_);
  // Only random-per-device fallback credentials use the physical recovery channel.
  if (!provisioning::TemporarySharedSetupPassword[0])
    Serial.println("Local setup WPA password (keep private): " + apPassword_);
  Serial.println("Open http://192.168.4.1 within 10 minutes.");
  return true;
}

void WiFiProvisioning::stopPortal() {
  dns_.stop(dnsSocket_);
  browser_.stop();
  response_.clear();
  memset(request_, 0, sizeof(request_));
  requestSize_ = 0;
  server_.end();
  WiFi.softAPdisconnect(false);
  WiFi.mode(WIFI_STA);
  token_ = "";
  formValues_ = "";
}

void WiFiProvisioning::result(bool connected, bool saved) {
  Serial.println(!connected ? "New network failed; existing networks preserved." :
                 saved ? "New network connected and saved; setup closed." :
                          "Network connected; WiFi/location/name/interval save NOT fully confirmed. Review configuration.");
  candidate_ = provisioning::Credential{};
  pendingLocation_ = provisioning::Location{};
  pendingName_ = provisioning::StationName{};
  pendingSendSeconds_ = 0;
}

void WiFiProvisioning::respond(int code, const String& body) {
  response_.clear();
  const String response = "HTTP/1.1 " + String(code) + " Response\r\nContent-Type: text/html; charset=utf-8\r\n"
      "Cache-Control: no-store\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\n"
      "Content-Security-Policy: default-src 'none'; form-action 'self'; frame-ancestors 'none'\r\n"
      "Content-Length: " + String(body.length()) + "\r\n\r\n" + body;
  browser_.print(response);
  browser_.stop();
  memset(request_, 0, sizeof(request_));
  requestSize_ = 0;
}

void WiFiProvisioning::asset(const char* body, size_t length, const char* type,
                             const char* tail, size_t tailLength) {
  if (tail) formValues_ = token_ + portal_assets::FormMiddle +
      provisioning::htmlAttribute<String>(stationName_.saved()) + portal_assets::FormInterval +
      (sendInterval_.saved() ? String(sendInterval_.saved()) : String("")) +
      portal_assets::FormEffective + String(sendIntervalSeconds()) +
      portal_assets::FormDefault + String(defaultSendSeconds_);
  const size_t tokenLength = tail ? formValues_.length() : 0;
  const int headerLength = snprintf(responseHeader_, sizeof(responseHeader_),
      "HTTP/1.1 200 OK\r\nContent-Type: %s\r\nCache-Control: no-store\r\n"
      "Connection: close\r\nX-Content-Type-Options: nosniff\r\n"
      "Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; "
      "img-src blob:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'\r\n"
      "Content-Length: %u\r\n\r\n", type, static_cast<unsigned>(length + tokenLength + tailLength));
  if (headerLength < 0 || size_t(headerLength) >= sizeof(responseHeader_)) {
    browser_.stop();
    return;
  }
  response_.begin(responseHeader_, size_t(headerLength), body, length,
                  tail ? formValues_.c_str() : nullptr, tokenLength, tail, tailLength);
  responseSince_ = millis();
  memset(request_, 0, sizeof(request_));
  requestSize_ = 0;
}

void WiFiProvisioning::stream() {
  if (provisioning::elapsed(millis(), responseSince_, 15000)) {
    browser_.stop(); response_.clear(); return;
  }
  if (!response_.active()) { browser_.stop(); return; }
  // ESP32 flash is memory mapped. One nonblocking send per loop preserves all
  // policy/sensor/OTA scheduling even when a phone stops reading the decoder.
  const int sent = ::send(browser_.fd(), response_.data(), response_.size(), MSG_DONTWAIT);
  if (sent > 0) {
    response_.advance(size_t(sent));
    if (!response_.active()) browser_.stop();
  }
  else if (sent == 0 || (errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR)) {
    browser_.stop(); response_.clear();
  }
}

void WiFiProvisioning::serve() {
  if (!browser_ || !browser_.connected()) {
    browser_.stop();
    response_.clear();
    browser_ = server_.available();
    requestSize_ = 0;
    memset(request_, 0, sizeof(request_));
    requestSince_ = millis();
  }
  if (!browser_) return;
  if (response_.active()) { stream(); return; }
  // Defense in depth, in addition to the interface-bound HTTP listener.
  if (browser_.localIP() != WiFi.softAPIP() ||
      provisioning::elapsed(millis(), requestSince_, 2000)) {
    browser_.stop();
    return;
  }
  unsigned int budget = 256;
  while (browser_.available() && budget-- && requestSize_ < provisioning::RequestLimit) {
    request_[requestSize_++] = char(browser_.read());
  }
  request_[requestSize_] = 0;
  provisioning::Credential submitted{};
  provisioning::Location submittedLocation;
  provisioning::StationName submittedName;
  uint32_t submittedInterval = 0;
  const provisioning::Request parsed = provisioning::parse(request_, requestSize_, token_.c_str(), submitted, &submittedLocation, &submittedName, &submittedInterval);
  if (parsed == provisioning::Request::Incomplete) {
    if (requestSize_ == provisioning::RequestLimit) respond(413, "Request too large.");
    return;
  }
  if (parsed == provisioning::Request::Captive) {
    // Fixed AP-local destination, no request data or token in the response.
    response_.begin(provisioning::CaptiveRedirect, sizeof(provisioning::CaptiveRedirect) - 1,
                    nullptr, 0, nullptr, 0, nullptr, 0);
    responseSince_ = millis();
    memset(request_, 0, sizeof(request_));
    requestSize_ = 0;
  } else if (parsed == provisioning::Request::Form) {
    asset(portal_assets::FormStart, sizeof(portal_assets::FormStart) - 1, "text/html; charset=utf-8",
          portal_assets::FormEnd, sizeof(portal_assets::FormEnd) - 1);
  } else if (parsed == provisioning::Request::Style) {
    asset(portal_assets::Style, sizeof(portal_assets::Style) - 1, "text/css; charset=utf-8");
  } else if (parsed == provisioning::Request::Script) {
    asset(portal_assets::Script, sizeof(portal_assets::Script) - 1, "application/javascript; charset=utf-8");
  } else if (parsed == provisioning::Request::Submit) {
    if (policy_.pending() || !storageReady_ || !metadataReady_ ||
        (!saved_.room() && !saved_.contains(submitted))) {
      respond(409, "Configuración ocupada o espacios guardados completos. Las redes existentes se conservan.");
      return;
    }
    candidate_ = submitted;
    pendingLocation_ = submittedLocation;
    pendingName_ = submittedName;
    pendingSendSeconds_ = submittedInterval;
    if (!policy_.submit(millis(), *this)) {
      candidate_ = provisioning::Credential{};
      pendingLocation_ = provisioning::Location{};
      pendingName_ = provisioning::StationName{};
      pendingSendSeconds_ = 0;
      respond(409, "La ventana de configuración está terminando. No se cambiaron credenciales. Reintente en la próxima ventana.");
      return;
    }
    // Only STA disconnects here; the AP response precedes the next begin().
    respond(202, "<!doctype html><html lang='es'><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'>"
        "<title>Probando conexión</title><h1>Solicitud recibida</h1><p>Espere unos 15 segundos. La red solo se intenta guardar después de una conexión correcta. "
        "La ubicación indicada solo se guarda después de conectar y guardar la red. El puerto serie confirma el guardado completo; la desaparición del punto de acceso no confirma la persistencia.</p>"
        "<p>Si la configuración sigue disponible, <a href='/'>vuelva a revisar los datos</a>. Las redes anteriores se conservan.</p></html>");
  } else {
    respond(400, "Solicitud inválida. No se cambiaron credenciales. Vuelva a abrir http://192.168.4.1 y revise los datos.");
  }
}

void WiFiProvisioning::loop() {
  const bool connected = WiFi.status() == WL_CONNECTED;
  const bool matches = connected && WiFi.SSID() == attempted_.ssid;
  policy_.tick(millis(), connected, matches, *this);
  if (policy_.portal()) { dns_.loop(dnsSocket_); serve(); }
}
