#ifndef DIAGNOSTICS_POLICY_H
#define DIAGNOSTICS_POLICY_H

#include <stdint.h>
#include <math.h>
#include <string.h>

namespace diagnostics {

inline bool configured(const char* token, const char* rootCA, bool approved) {
  const size_t size = strlen(token);
  if (!approved || size < 32 || size > 256 || !rootCA[0]) return false;
  for (size_t i = 0; i < size; ++i) {
    const char c = token[i];
    if (!((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
          (c >= '0' && c <= '9') || c == '_' || c == '-')) return false;
  }
  return true;
}

inline bool clockReady(bool synchronized, int64_t epochSeconds) {
  return synchronized && epochSeconds >= 1767225600;
}

inline bool validSample(float temperature, float humidity) {
  return isfinite(temperature) && isfinite(humidity) &&
      temperature >= 0 && temperature <= 50 && humidity >= 0 && humidity <= 100;
}

class State {
 public:
  void tick(uint32_t now) {
    uptimeMs += uint32_t(now - previous);
    previous = now;
  }
  void sample(float temperature, float humidity) {
    sampled = true;
    valid = validSample(temperature, humidity);
  }
  const char* sensorStatus() const { return !sampled ? "unknown" : valid ? "ok" : "error"; }
  const char* errorCode() const { return sampled && !valid ? "DHT_INVALID_SAMPLE" : "NONE"; }
  bool sampled = false;
  bool valid = false;
  uint64_t uptimeMs = 0;
 private:
  uint32_t previous = 0;
};

class Delivery {
 public:
  template <typename Clock, typename Ready, typename Send>
  void service(const State& state, Clock clock, Ready ready, Send send) {
    if (!state.sampled) return;
    for (auto& destination : destinations) {
      const uint32_t now = clock();
      if ((destination.attempted && uint32_t(now - destination.lastAttempt) < destination.waitMs) || !ready()) continue;
      destination.attempted = true;
      destination.lastAttempt = now;
      const int code = send(destination.url);
      if (code >= 200 && code < 300) {
        destination.waitMs = 60000;
        destination.failures = 0;
      } else if (code == 401 || code == 403) {
        destination.waitMs = 3600000;
      } else if (code == 404 || code == 405) {
        destination.waitMs = 900000;
      } else {
        if (destination.failures < 4) ++destination.failures;
        destination.waitMs = 60000UL << destination.failures;
      }
    }
  }
 private:
  struct Destination {
    const char* url;
    uint32_t lastAttempt;
    uint32_t waitMs;
    uint8_t failures;
    bool attempted;
  };
  Destination destinations[2] = {
    {"https://miniestaciones.vercel.app/api/diagnostics", 0, 0, 0, false},
    {"https://estaciones.modernshop.com.ar/api/diagnostics", 0, 0, 0, false}
  };
};

}  // namespace diagnostics
#endif
