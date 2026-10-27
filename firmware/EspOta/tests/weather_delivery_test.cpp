#include "../WeatherDelivery.h"
#include <assert.h>
#include <iostream>
#include <string>
#include <vector>

struct Attempt {
  std::string url;
  weather::Sample sample;
};

struct Harness {
  weather::Delivery delivery;
  uint32_t now;
  bool ready = true;
  bool originalOK = true;
  bool newOK = true;
  uint32_t duration = 0;
  weather::Sample latest{20.5f, 60.0f};
  std::vector<Attempt> attempts;

  explicit Harness(uint32_t start = 0) : now(start) { delivery.begin(now); }

  void poll() {
    delivery.service(latest, [this]() { return now; },
        [this]() { return ready; },
        [this](const char* url, const weather::Sample& sample) {
          attempts.push_back(Attempt{url, sample});
          // Simulate a reading changing during synchronous work.
          latest.temperature += 1;
          now += duration;
          return attempts.back().url == "https://miniestaciones.vercel.app/api/esp32"
              ? originalOK : newOK;
        });
  }
};

void immediateThenEveryFiveMinutes() {
  Harness h;
  h.poll();
  assert(h.attempts.size() == 2);
  assert(h.attempts[0].url == "https://miniestaciones.vercel.app/api/esp32");
  assert(h.attempts[1].url == "https://estaciones.modernshop.com.ar/api/esp32");
  assert(h.attempts[0].sample.temperature == 20.5f);
  assert(h.attempts[1].sample.temperature == 20.5f);
  assert(h.attempts[0].sample.humidity == h.attempts[1].sample.humidity);
  h.now = 299999;
  h.poll();
  assert(h.attempts.size() == 2);
  h.now = 300000;
  h.poll();
  assert(h.attempts.size() == 4);
}

void independentRetry(bool originalFails) {
  Harness h;
  h.originalOK = !originalFails;
  h.newOK = originalFails;
  h.now = 300000;
  h.poll();
  const std::string failed = h.attempts[originalFails ? 0 : 1].url;
  h.now = 359999;
  h.poll();
  assert(h.attempts.size() == 2);
  h.latest = weather::Sample{25.0f, 70.0f};
  h.now = 360000;
  h.poll();
  assert(h.attempts.size() == 3);
  assert(h.attempts.back().url == failed);
  assert(h.attempts.back().sample.temperature == 25.0f);
  h.poll();
  assert(h.attempts.size() == 3);  // No tight retry loop.
  for (h.now = 420000; h.now <= 600000; h.now += 60000) h.poll();
  assert(h.attempts.size() == 8);  // Four failed retries, one healthy send.
  assert(h.attempts[6].url == "https://miniestaciones.vercel.app/api/esp32");
  assert(h.attempts[7].url == "https://estaciones.modernshop.com.ar/api/esp32");
  h.originalOK = h.newOK = true;
  h.now = 660000;
  h.poll();
  assert(h.attempts.size() == 9);
  h.now = 720000;
  h.poll();
  assert(h.attempts.size() == 9);  // Recovered destination also waits five minutes.
}

void completionTimingAndNetworkGate() {
  Harness h;
  h.now = 300000;
  h.ready = false;
  h.poll();
  assert(h.attempts.empty());
  h.ready = true;
  h.duration = 5000;
  h.poll();
  assert(h.now == 310000);
  h.duration = 0;
  h.now = 604999;
  h.poll();
  assert(h.attempts.size() == 2);
  h.now = 605000;
  h.poll();
  assert(h.attempts.size() == 3);
  h.now = 610000;
  h.poll();
  assert(h.attempts.size() == 4);
}

void rollover() {
  const uint32_t start = UINT32_MAX - 150000;
  Harness h(start);
  h.newOK = false;
  h.poll();
  assert(h.attempts.size() == 2);
  h.now = start + uint32_t(59999);
  h.poll();
  assert(h.attempts.size() == 2);
  h.now = start + uint32_t(60000);
  h.poll();
  assert(h.attempts.size() == 3);
  assert(h.attempts.back().url == "https://estaciones.modernshop.com.ar/api/esp32");
  h.newOK = true;
  h.now = start + uint32_t(300000);
  h.poll();
  assert(h.attempts.size() == 5);
  h.now += 300000;
  h.poll();
  assert(h.attempts.size() == 7);
}

void readinessAndReconnect() {
  Harness h;
  h.ready = false;
  h.delivery.network(false);
  h.poll(); assert(h.attempts.empty()); // Portal active or WiFi unavailable.
  h.ready = true;
  h.delivery.network(true);
  h.latest.temperature = NAN;
  h.poll(); assert(h.attempts.empty());
  h.latest.temperature = 21;
  h.latest.humidity = INFINITY;
  h.poll(); assert(h.attempts.empty());
  h.latest.humidity = 50;
  h.now = 10000; // First usable DHT sample, no five-minute startup wait.
  h.newOK = false;
  h.poll(); assert(h.attempts.size() == 2);
  h.now = 20000;
  h.delivery.network(false); h.delivery.network(true);
  h.poll(); assert(h.attempts.size() == 2); // Flapping cannot bypass backoff.
  h.now = 69999;
  h.delivery.network(true); h.poll(); assert(h.attempts.size() == 2);
  h.now = 70000;
  h.newOK = true;
  h.poll(); assert(h.attempts.size() == 4);
  h.now = 130000;
  h.delivery.network(true); h.poll(); assert(h.attempts.size() == 4);
  h.delivery.network(false); h.delivery.network(true);
  h.poll(); assert(h.attempts.size() == 6); // Confirmed edge, before interval.
  h.now = 190000;
  h.delivery.network(true); h.poll(); assert(h.attempts.size() == 6);
}

void intervalChanges() {
  Harness h;
  assert(!h.delivery.setIntervalSeconds(0, h.now));
  assert(!h.delivery.setIntervalSeconds(86401, h.now));
  h.poll(); assert(h.attempts.size() == 2);
  h.now = 1000;
  assert(h.delivery.setIntervalSeconds(60, h.now));
  h.poll(); assert(h.attempts.size() == 2);
  h.now = 60999; h.poll(); assert(h.attempts.size() == 2);
  h.now = 61000; h.poll(); assert(h.attempts.size() == 4);
  // Max interval remains wrap-safe, measured from the change with no burst.
  assert(h.delivery.setIntervalSeconds(86400, h.now));
  h.now += 86399999; h.poll(); assert(h.attempts.size() == 4);
  ++h.now; h.poll(); assert(h.attempts.size() == 6);
  Harness failed;
  failed.originalOK = false; failed.poll();
  failed.now = 1000; failed.delivery.setIntervalSeconds(86400, failed.now);
  failed.now = 59999; failed.poll(); assert(failed.attempts.size() == 2);
  failed.now = 60000; failed.poll(); assert(failed.attempts.size() == 3);
}

int main() {
  immediateThenEveryFiveMinutes();
  independentRetry(false);
  independentRetry(true);
  completionTimingAndNetworkGate();
  rollover();
  readinessAndReconnect();
  intervalChanges();
  std::cout << "7 delivery behavioral scenarios passed\n";
}
