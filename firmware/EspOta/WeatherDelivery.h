#ifndef WEATHER_DELIVERY_H
#define WEATHER_DELIVERY_H

#include <stdint.h>

namespace weather {

struct Sample {
  float temperature;
  float humidity;
};

class Delivery {
 public:
  Delivery() : destinations{
      {"https://miniestaciones.vercel.app/api/esp32", 0, 0, false},
      {"https://estaciones.modernshop.com.ar/api/esp32", 0, 0, false}} {}

  void begin(uint32_t now) {
    for (auto& destination : destinations) {
      destination.lastSuccess = now;
      destination.lastAttempt = now;
      destination.attempted = false;
    }
  }

  // One latest-sample snapshot for this pass; no historical queue.
  // The original endpoint is always considered before the new endpoint.
  template <typename Clock, typename Ready, typename Send>
  void service(Sample sample, Clock clock, Ready ready, Send send) {
    for (auto& destination : destinations) {
      const uint32_t now = clock();
      if (uint32_t(now - destination.lastSuccess) < 300000UL ||
          (destination.attempted &&
           uint32_t(now - destination.lastAttempt) < 60000UL) || !ready()) {
        continue;
      }
      destination.attempted = true;
      destination.lastAttempt = now;
      if (send(destination.url, sample)) {
        destination.lastSuccess = clock();
      }
    }
  }

 private:
  struct Destination {
    const char url[64];
    uint32_t lastSuccess;
    uint32_t lastAttempt;
    bool attempted;
  };
  Destination destinations[2];
};

}  // namespace weather

#endif
