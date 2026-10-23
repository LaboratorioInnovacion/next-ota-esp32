#include "WiFiProvisioning.h"
#include "SetupConfig.h"
#include <esp_system.h>

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
  policy_.begin(millis(), saved_.count + compiledCount_, *this);
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
  return saved;
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
  String suffix = WiFi.macAddress();
  suffix.replace(":", "");
  apName_ = "Station-Setup-" + suffix.substring(6);
  if (!WiFi.mode(WIFI_AP_STA) ||
      !WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0)) ||
      !WiFi.softAP(apName_.c_str(), apPassword_.c_str(), 1, false, 1)) {
    WiFi.softAPdisconnect(false);
    WiFi.mode(WIFI_STA);
    return false;
  }
  server_.begin();
  Serial.println("Local setup AP: " + apName_);
  // Only random-per-device fallback credentials use the physical recovery channel.
  if (!provisioning::TemporarySharedSetupPassword[0])
    Serial.println("Local setup WPA password (keep private): " + apPassword_);
  Serial.println("Open http://192.168.4.1 within 10 minutes.");
  return true;
}

void WiFiProvisioning::stopPortal() {
  browser_.stop();
  memset(request_, 0, sizeof(request_));
  requestSize_ = 0;
  server_.end();
  WiFi.softAPdisconnect(false);
  WiFi.mode(WIFI_STA);
  token_ = "";
}

void WiFiProvisioning::result(bool connected, bool saved) {
  Serial.println(!connected ? "New network failed; existing networks preserved." :
                 saved ? "New network connected and saved; setup closed." :
                         "Network connected; save NOT confirmed. Existing networks preserved.");
  candidate_ = provisioning::Credential{};
}

void WiFiProvisioning::respond(int code, const String& body) {
  const String response = "HTTP/1.1 " + String(code) + " Response\r\nContent-Type: text/html; charset=utf-8\r\n"
      "Cache-Control: no-store\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\n"
      "Content-Security-Policy: default-src 'none'; form-action 'self'; frame-ancestors 'none'\r\n"
      "Content-Length: " + String(body.length()) + "\r\n\r\n" + body;
  browser_.print(response);
  browser_.stop();
  memset(request_, 0, sizeof(request_));
  requestSize_ = 0;
}

void WiFiProvisioning::serve() {
  if (!browser_ || !browser_.connected()) {
    browser_.stop();
    browser_ = server_.available();
    requestSize_ = 0;
    memset(request_, 0, sizeof(request_));
    requestSince_ = millis();
  }
  if (!browser_) return;
  // WiFiServer listens on both interfaces; reject STA-side sockets before parsing.
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
  const provisioning::Request parsed = provisioning::parse(request_, requestSize_, token_.c_str(), submitted);
  if (parsed == provisioning::Request::Incomplete) {
    if (requestSize_ == provisioning::RequestLimit) respond(413, "Request too large.");
    return;
  }
  if (parsed == provisioning::Request::Form) {
    String body = "<!doctype html><meta name='viewport' content='width=device-width'><title>Station WiFi</title>"
        "<h1>Add a WiFi network</h1><p>Use a 2.4 GHz WPA network. No Internet is needed for this form.</p>"
        "<form method='post' action='/save'><input type='hidden' name='token' value='" + token_ + "'>"
        "<label>SSID <input name='ssid' maxlength='32' required></label><br>"
        "<label>Password <input name='password' type='password' minlength='8' maxlength='63' required autocomplete='new-password'></label>"
        "<button>Add network</button></form><p>After submission, allow 15 seconds. "
        "AP disappearance means connection succeeded, not necessarily persistence. Check serial for save confirmation. "
        "If it remains, reconnect and retry. Existing networks are never erased.</p>";
    respond(200, body);
  } else if (parsed == provisioning::Request::Submit) {
    if (policy_.pending() || !storageReady_ || (!saved_.room() && !saved_.contains(submitted))) {
      respond(409, "Busy or saved network slots full. Existing networks preserved.");
      return;
    }
    candidate_ = submitted;
    if (!policy_.submit(millis(), *this)) {
      candidate_ = provisioning::Credential{};
      respond(409, "Setup window ending. No credentials changed. Retry in the next window.");
      return;
    }
    // Only STA disconnects here; the AP response precedes the next begin().
    respond(202, "Connection test accepted. Wait 15 seconds. Saved only on successful association; check serial for persistence result.");
  } else {
    respond(400, "Invalid request. No credentials changed.");
  }
}

void WiFiProvisioning::loop() {
  const bool connected = WiFi.status() == WL_CONNECTED;
  const bool matches = connected && WiFi.SSID() == attempted_.ssid;
  policy_.tick(millis(), connected, matches, *this);
  if (policy_.portal()) serve();
}
