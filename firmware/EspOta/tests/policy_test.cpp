#include "../CredentialStore.h"
#include "../PortalRequest.h"
#include <assert.h>
#include <iostream>
#include <string>
#include <vector>

using namespace provisioning;

struct Memory : Storage {
  Credential slots[MaxNetworks]{};
  size_t sizes[MaxNetworks]{};
  bool failWrite = false, failReadback = false;
  int writes = 0;
  size_t read(size_t slot, Credential& out) override {
    if (failReadback && writes) return 1;
    out = slots[slot];
    return sizes[slot];
  }
  bool write(size_t slot, const Credential& value) override {
    ++writes;
    if (failWrite) return false;
    slots[slot] = value;
    sizes[slot] = sizeof(value);
    return true;
  }
};

Credential make(const char* ssid = "hotspot", const char* password = "private-pass") {
  Credential c{};
  assert(assign(c, ssid, strlen(ssid), password, strlen(password)));
  return c;
}

struct Fake : Driver {
  int disconnects = 0, connects = 0, saves = 0, starts = 0, stops = 0, results = 0;
  size_t index = 99;
  bool candidate = false, saveOK = true, apOK = true, connectedResult = false, savedResult = false;
  void disconnect() override { ++disconnects; }
  void connect(size_t i, bool c) override { ++connects; index = i; candidate = c; }
  bool saveCandidate() override { ++saves; return saveOK; }
  bool startPortal() override { ++starts; return apOK; }
  void stopPortal() override { ++stops; }
  void result(bool c, bool s) override { ++results; connectedResult = c; savedResult = s; }
};

void validation() {
  Credential c = make();
  const Credential original = c;
  assert(!assign(c, "", 0, "private-pass", 12));
  assert(!memcmp(&c, &original, sizeof(c)));
  for (size_t sn : {size_t(1), size_t(32)}) {
    std::string ssid(sn, 's');
    for (size_t pn : {size_t(8), size_t(63)}) {
      std::string password(pn, 'p');
      assert(assign(c, ssid.data(), sn, password.data(), pn));
      assert(valid(c));
    }
  }
  assert(!valid("x", 1, "", 0)); // Never an implicit open network.
  assert(!valid("x", 1, "1234567", 7));
  assert(!valid("x", 1, std::string(64, 'p').data(), 64));
  assert(!valid(std::string(33, 's').data(), 33, "12345678", 8));
  assert(!valid("a\0b", 3, "12345678", 8));
  assert(!valid("x", 1, "1234567\n", 8));
  Credential unterminated;
  memset(unterminated.ssid, 'x', sizeof(unterminated.ssid));
  memset(unterminated.password, 'x', sizeof(unterminated.password));
  assert(!valid(unterminated));
}

void setupPasswordSelection() {
  const char* stored = "0123456789abcdef0123456789abcdef";
  const char* fixed = "test-only-pass";
  assert(selectSetupPassword(fixed, stored) == fixed);
  assert(selectSetupPassword(fixed, "corrupt") == fixed);
  assert(selectSetupPassword(fixed, nullptr) == fixed);
  assert(selectSetupPassword("", stored) == stored);
  assert(selectSetupPassword(nullptr, stored) == stored);
  assert(!selectSetupPassword("", nullptr));
  assert(!selectSetupPassword("", "corrupt"));
  for (const std::string& invalid : {std::string("short"), std::string(64, 'p'),
                                    std::string("1234567\n"), std::string("1234567\x7f")}) {
    // Invalid fixed configuration must not silently reuse a valid NVS password.
    const bool accepted = selectSetupPassword(invalid.c_str(), stored) != nullptr;
    assert(!accepted);
    Policy policy;
    Fake driver;
    driver.apOK = accepted;
    policy.begin(0, 0, driver);
    assert(!policy.portal() && !policy.submit(1, driver));
    policy.tick(RetryMs, false, false, driver);
    assert(driver.starts == 1); // Failed startup still respects cooldown.
  }
  for (size_t length : {size_t(8), size_t(63)}) {
    const std::string boundary(length, 'p');
    assert(selectSetupPassword(boundary.c_str(), stored) == boundary.c_str());
  }
}

void ownedAndPersistent() {
  Memory memory;
  SavedNetworks saved;
  saved.load(memory);
  Credential input = make();
  assert(saved.commit(memory, input));
  input.password[0] = 'X';
  assert(!strcmp(saved.entries[0].password, "private-pass"));
  SavedNetworks rebooted;
  rebooted.load(memory);
  assert(rebooted.count == 1 && rebooted.contains(make()));
  assert(rebooted.commit(memory, make()));
  assert(memory.writes == 1); // Duplicate never spends flash writes/slots.
}

void failedSavePreserves() {
  for (bool readFailure : {false, true}) {
    Memory memory;
    SavedNetworks saved;
    saved.load(memory);
    assert(saved.commit(memory, make("known")));
    const Credential previous = memory.slots[0];
    memory.writes = 0;
    memory.failWrite = !readFailure;
    memory.failReadback = readFailure;
    assert(!saved.commit(memory, make("new")));
    assert(saved.count == 1);
    assert(!memcmp(&memory.slots[0], &previous, sizeof(previous)));
    memory.failReadback = false;
    SavedNetworks rebooted;
    rebooted.load(memory);
    assert(rebooted.contains(make("known")));
  }
  Memory memory;
  SavedNetworks saved;
  memory.sizes[0] = 1; // Corrupt occupied slot is reserved.
  saved.load(memory);
  for (size_t i = 1; i < MaxNetworks; ++i) {
    const std::string name = "net" + std::to_string(i);
    assert(saved.commit(memory, make(name.c_str())));
  }
  assert(memory.sizes[0] == 1 && !saved.room());
  assert(!saved.commit(memory, make("overflow")));
}

void knownCycleAndRuntimeLoss() {
  Policy policy;
  Fake driver;
  policy.begin(0, 2, driver);
  policy.tick(99, false, false, driver);
  assert(driver.connects == 0);
  policy.tick(100, false, false, driver);
  assert(driver.index == 0);
  policy.tick(10100, false, false, driver);
  policy.tick(10200, false, false, driver);
  assert(driver.index == 1 && driver.starts == 0);
  policy.tick(10700, true, true, driver);
  assert(policy.online() && driver.saves == 0);
  // MQTT/HTTP outcomes are deliberately not inputs to WiFi policy.
  policy.tick(90000, true, true, driver);
  assert(policy.online() && driver.starts == 0);
  policy.tick(90001, false, false, driver);
  assert(policy.state() == Policy::State::Disconnecting);
  policy.tick(90101, false, false, driver);
  assert(driver.index == 0);
}

void exhaustionAndBackoff() {
  Policy policy;
  Fake driver;
  policy.begin(0, 1, driver);
  policy.tick(100, false, false, driver);
  policy.tick(10100, false, false, driver);
  assert(policy.portal() && driver.starts == 1);
  policy.tick(40099, false, false, driver);
  assert(driver.connects == 1);
  policy.tick(40100, false, false, driver);
  policy.tick(40200, false, false, driver);
  assert(driver.connects == 2 && driver.starts == 1);
}

void candidateProofAndFailure() {
  Policy policy;
  Fake driver;
  policy.begin(0, 0, driver);
  assert(policy.portal() && policy.submit(1, driver));
  assert(!policy.submit(2, driver));
  policy.tick(101, true, true, driver); // Stale association, not disconnected yet.
  assert(driver.connects == 0 && driver.saves == 0 && policy.portal());
  policy.tick(102, false, false, driver);
  assert(driver.connects == 1 && driver.candidate);
  policy.tick(602, true, false, driver); // Wrong network cannot commit.
  assert(driver.saves == 0 && policy.portal());
  policy.tick(10102, false, false, driver);
  assert(driver.saves == 0 && driver.results == 1 && !driver.connectedResult);
  assert(policy.portal() && !policy.pending());
  assert(policy.submit(10103, driver));
  policy.tick(10203, false, false, driver);
  policy.tick(10703, true, true, driver);
  assert(driver.saves == 1 && driver.savedResult && policy.online());
  assert(driver.stops == 1 && !policy.portal());
}

void staleDisconnectTimeoutAndSaveFailure() {
  Policy policy;
  Fake driver;
  policy.begin(0, 0, driver);
  assert(policy.submit(1, driver));
  policy.tick(2001, true, true, driver);
  assert(driver.saves == 0 && driver.connects == 0 && !policy.pending());
  driver.saveOK = false;
  assert(policy.submit(2002, driver));
  policy.tick(2102, false, false, driver);
  policy.tick(2602, true, true, driver);
  assert(driver.saves == 1 && !driver.savedResult && driver.connectedResult);
  assert(policy.online() && !policy.portal());
}

void finiteWindowAndCooldown() {
  Policy policy;
  Fake driver;
  policy.begin(0, 0, driver);
  assert(!policy.submit(WindowMs - AttemptMs - 3000, driver));
  policy.tick(WindowMs, false, false, driver);
  assert(!policy.portal() && driver.stops == 1 && driver.starts == 1);
  for (uint32_t now = WindowMs + RetryMs; now < WindowMs + CooldownMs; now += RetryMs)
    policy.tick(now, false, false, driver);
  assert(driver.starts == 1);
  policy.tick(WindowMs + CooldownMs, false, false, driver);
  assert(driver.starts == 2 && policy.portal());
}

void protectedStartupFailure() {
  Policy policy;
  Fake driver;
  driver.apOK = false; // Storage/AP failure: never an open fallback.
  policy.begin(0, 0, driver);
  assert(!policy.portal() && !policy.submit(1, driver));
  for (uint32_t now = RetryMs; now < CooldownMs; now += RetryMs)
    policy.tick(now, false, false, driver);
  assert(driver.starts == 1);
  policy.tick(CooldownMs, false, false, driver);
  assert(driver.starts == 2 && !policy.portal());
}

void rollover() {
  const uint32_t start = UINT32_MAX - 50;
  assert(!elapsed(start + 99, start, 100));
  assert(elapsed(start + 100, start, 100));
  Policy policy;
  Fake driver;
  policy.begin(start, 1, driver);
  policy.tick(start + 100, false, false, driver);
  policy.tick(start + 10100, false, false, driver);
  assert(policy.portal());
  policy.tick(start + 10100 + WindowMs, false, false, driver);
  assert(!policy.portal() && driver.stops == 1);
}

const std::string token(32, 'a');
std::string post(const std::string& body, const std::string& headers = "") {
  return "POST /save HTTP/1.1\r\nHost: 192.168.4.1\r\nContent-Type: application/x-www-form-urlencoded\r\n"
      "Content-Length: " + std::to_string(body.size()) + "\r\n" + headers + "\r\n" + body;
}
Request request(const std::string& raw, Credential& out) {
  return parse(raw.c_str(), raw.size(), token.c_str(), out);
}

void browserProtocol() {
  Credential out{};
  assert(request("GET / HTTP/1.1\r\nHost: 192.168.4.1\r\n\r\n", out) == Request::Form);
  const std::string body = "ssid=Phone+Hotspot&password=private%2Bpass&token=" + token;
  const std::string validRequest = post(body, "Origin: http://192.168.4.1\r\n");
  for (size_t n = 0; n < validRequest.size(); ++n)
    assert(request(validRequest.substr(0, n), out) == Request::Incomplete);
  assert(request(validRequest, out) == Request::Submit);
  assert(!strcmp(out.ssid, "Phone Hotspot") && !strcmp(out.password, "private+pass"));
  for (const char* extra : {
      "Origin: https://attacker.example\r\n", "Origin: null\r\n", "Host: attacker.example\r\n",
      "Transfer-Encoding: chunked\r\n", "Content-Length: 1\r\n"})
    assert(request(post(body, extra), out) == Request::Reject);
  assert(request(post("ssid=x&password=private-pass"), out) == Request::Reject);
  assert(request(post(body + "&token=" + token), out) == Request::Reject);
  assert(request(post("ssid=x&password=&token=" + token), out) == Request::Reject);
  assert(request(post("ssid=x%00y&password=private-pass&token=" + token), out) == Request::Reject);
  assert(request(post("ssid=x%GG&password=private-pass&token=" + token), out) == Request::Reject);
  assert(request(post("ssid=x&password=" + std::string(64, 'p') + "&token=" + token), out) == Request::Reject);
  assert(request(std::string(1024, 'x'), out) == Request::Reject);
  assert(request(post(std::string(513, 'x')), out) == Request::Reject);
  assert(request(validRequest + "x", out) == Request::Reject);
}

void parserBoundedNoise() {
  uint32_t seed = 42;
  Credential out{};
  for (size_t n = 0; n < 10000; ++n) {
    std::string noise;
    seed = seed * 1664525u + 1013904223u;
    const size_t size = seed % 1600;
    for (size_t i = 0; i < size; ++i) {
      seed = seed * 1664525u + 1013904223u;
      noise += char(seed >> 24);
    }
    const Request parsed = request(noise, out);
    assert(parsed == Request::Reject || parsed == Request::Incomplete);
  }
}

int main() {
  int tests = 0;
#define RUN(test) do { test(); ++tests; std::cout << "PASS " #test "\n"; } while (0)
  RUN(validation);
  RUN(setupPasswordSelection);
  RUN(ownedAndPersistent);
  RUN(failedSavePreserves);
  RUN(knownCycleAndRuntimeLoss);
  RUN(exhaustionAndBackoff);
  RUN(candidateProofAndFailure);
  RUN(staleDisconnectTimeoutAndSaveFailure);
  RUN(finiteWindowAndCooldown);
  RUN(protectedStartupFailure);
  RUN(rollover);
  RUN(browserProtocol);
  RUN(parserBoundedNoise);
  std::cout << tests << " behavioral tests passed\n";
}
