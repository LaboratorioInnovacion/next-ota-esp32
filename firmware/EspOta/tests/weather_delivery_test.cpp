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

void bothEveryFiveMinutes() {
  Harness h;
  h.now = 299999;
  h.poll();
  assert(h.attempts.empty());
  h.now = 300000;
  h.poll();
  assert(h.attempts.size() == 2);
  assert(h.attempts[0].url == "https://miniestaciones.vercel.app/api/esp32");
  assert(h.attempts[1].url == "https://estaciones.modernshop.com.ar/api/esp32");
  assert(h.attempts[0].sample.temperature == 20.5f);
  assert(h.attempts[1].sample.temperature == 20.5f);
  assert(h.attempts[0].sample.humidity == h.attempts[1].sample.humidity);
  h.now = 599999;
  h.poll();
  assert(h.attempts.size() == 2);
  h.now = 600000;
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
  h.now = start + uint32_t(299999);
  h.poll();
  assert(h.attempts.empty());
  h.now = start + uint32_t(300000);
  h.poll();
  assert(h.attempts.size() == 2);
  h.now += 60000;
  h.poll();
  assert(h.attempts.size() == 3);
  assert(h.attempts.back().url == "https://estaciones.modernshop.com.ar/api/esp32");
}

int main() {
  bothEveryFiveMinutes();
  independentRetry(false);
  independentRetry(true);
  completionTimingAndNetworkGate();
  rollover();
  std::cout << "5 delivery behavioral scenarios passed\n";
}
