#ifndef WEATHER_DELIVERY_H
#define WEATHER_DELIVERY_H

#include <stdint.h>
#include <math.h>
#include "SendInterval.h"

namespace weather {

struct Sample {
  float temperature;
  float humidity;
};

class Delivery {
 public:
  Delivery() : destinations{
      {"https://miniestaciones.vercel.app/api/esp32", 0, 0, false, true},
      {"https://estaciones.modernshop.com.ar/api/esp32", 0, 0, false, true}} {}

  void begin(uint32_t now) {
    connected_ = false;
    for (auto& destination : destinations) {
      destination.lastSuccess = now;
      destination.lastAttempt = now;
      destination.attempted = false;
      destination.pending = true;
    }
  }

  // Observe connectivity even when no valid sample exists. Repeated connected
  // polls do not reset timers; reconnects retain each endpoint's retry backoff.
  void network(bool connected) {
    if (connected && !connected_)
      for (auto& destination : destinations) destination.pending = true;
    connected_ = connected;
  }

  bool setIntervalSeconds(uint32_t seconds, uint32_t now) {
    if (!provisioning::validSendInterval(seconds)) return false;
    const uint32_t next = seconds * 1000UL;
    if (next != intervalMs_) {
      intervalMs_ = next;
      for (auto& destination : destinations)
        if (!destination.pending) destination.lastSuccess = now;
    }
    return true;
  }

  // One latest-sample snapshot for this pass; no historical queue.
  // The original endpoint is always considered before the new endpoint.
  template <typename Clock, typename Ready, typename Send>
  void service(Sample sample, Clock clock, Ready ready, Send send) {
    if (!isfinite(sample.temperature) || !isfinite(sample.humidity)) return;
    for (auto& destination : destinations) {
      const uint32_t now = clock();
      if ((!destination.pending && uint32_t(now - destination.lastSuccess) < intervalMs_) ||
          (destination.attempted &&
           uint32_t(now - destination.lastAttempt) < 60000UL) || !ready()) {
        continue;
      }
      destination.attempted = true;
      destination.pending = true;
      destination.lastAttempt = now;
      if (send(destination.url, sample)) {
        destination.lastSuccess = clock();
        destination.pending = false;
      }
    }
  }

 private:
  struct Destination {
    const char url[64];
    uint32_t lastSuccess;
    uint32_t lastAttempt;
    bool attempted;
    bool pending;
  };
  Destination destinations[2];
  uint32_t intervalMs_ = provisioning::DefaultSendIntervalSeconds * 1000UL;
  bool connected_ = false;
};

}  // namespace weather

#endif
