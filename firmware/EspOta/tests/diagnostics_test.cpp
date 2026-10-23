#include "../DiagnosticsPolicy.h"
#include "../WeatherDelivery.h"
#include <assert.h>
#include <iostream>
#include <string>

void classification() {
  diagnostics::State state;
  assert(std::string(state.sensorStatus()) == "unknown");
  state.sample(0, 0);
  assert(state.valid && std::string(state.sensorStatus()) == "ok");
  for (float temperature : {NAN, INFINITY, -1.0f, 51.0f}) {
    state.sample(temperature, 50);
    assert(!state.valid && std::string(state.errorCode()) == "DHT_INVALID_SAMPLE");
  }
  for (float humidity : {NAN, INFINITY, -1.0f, 101.0f}) {
    state.sample(20, humidity);
    assert(!state.valid);
  }
  state.sample(50, 100);
  assert(state.valid && std::string(state.errorCode()) == "NONE");
}

void uptimeRollover() {
  diagnostics::State state;
  state.tick(UINT32_MAX - 10);
  state.tick(20);
  assert(state.uptimeMs == uint64_t(UINT32_MAX) + 21);
  state.tick(60020);
  assert(state.uptimeMs == uint64_t(UINT32_MAX) + 60021);
}

void failClosed() {
  const char* synthetic = "synthetic_test_token_not_a_secret_123";
  assert(!diagnostics::configured("", "root", true));
  assert(!diagnostics::configured(synthetic, "", true));
  assert(!diagnostics::configured(synthetic, "root", false));
  assert(!diagnostics::configured("synthetic_test_token_with_newline\n123", "root", true));
  assert(diagnostics::configured(synthetic, "root", true));
  assert(!diagnostics::clockReady(false, 1900000000));
  assert(!diagnostics::clockReady(true, 0));
  assert(diagnostics::clockReady(true, 1900000000));
}

void schedulingAndWeatherIndependence() {
  diagnostics::State state;
  diagnostics::Delivery delivery;
  weather::Delivery weather;
  uint32_t now = UINT32_MAX - 30000;
  weather.begin(now);
  int original = 0, second = 0, weatherCalls = 0;
  bool ready = false;
  const auto poll = [&]() {
    delivery.service(state, [&]() { return now; }, [&]() { return ready; },
      [&](const char* url) {
        if (std::string(url).find("vercel") != std::string::npos) { ++original; return 404; }
        ++second;
        return 200;
      });
    if (state.valid) weather.service(weather::Sample{0, 0}, [&]() { return now; },
      [&]() { return ready; }, [&](const char*, weather::Sample) { ++weatherCalls; return true; });
  };
  poll();
  state.sample(NAN, 50);
  poll();
  assert(original == 0 && second == 0);
  ready = true;
  poll();
  assert(original == 1 && second == 1 && weatherCalls == 0);
  now += 59999;
  poll();
  assert(second == 1);
  ++now;
  poll();
  assert(original == 1 && second == 2);
  state.sample(0, 0);
  now += 240000;
  poll();
  assert(weatherCalls == 2 && state.valid);
  now += 600000;
  poll();
  assert(original == 2);
}

void boundedBackoff() {
  diagnostics::State state;
  state.sample(NAN, NAN);
  diagnostics::Delivery delivery;
  uint32_t now = 0;
  int calls = 0;
  int result = 401;
  const auto poll = [&]() {
    delivery.service(state, [&]() { return now; }, []() { return true; },
      [&](const char*) { ++calls; return result; });
  };
  poll();
  now = 3599999;
  poll();
  assert(calls == 2);
  ++now;
  result = -1;
  poll();
  assert(calls == 4);
  for (uint32_t interval : {120000U, 240000U, 480000U, 960000U, 960000U}) {
    const int before = calls;
    now += interval - 1;
    poll();
    assert(calls == before);
    ++now;
    poll();
    assert(calls == before + 2);
  }
  result = 200;
  now += 960000;
  poll();
  const int before = calls;
  now += 60000;
  poll();
  assert(calls == before + 2);
}

int main() {
  classification();
  uptimeRollover();
  failClosed();
  schedulingAndWeatherIndependence();
  boundedBackoff();
  std::cout << "5 diagnostics behavioral scenarios passed\n";
}
