#include "../PortalRequest.h"
#include "../PortalAssets.h"
#include "../PortalStream.h"
#include <assert.h>
#include <iostream>
#include <map>
#include <string>
#include <vector>
using namespace provisioning;

struct Preferences {
  std::map<std::string, std::string> keys{{"stationName", "Existing"}, {"location", "Existing"},
      {"net0", "Existing"}, {"setup-pass", "test-only"}};
  bool fail = false, corruptRead = false;
  int writes = 0;
  size_t getBytesLength(const char* key) { return keys.count(key) ? keys[key].size() : 0; }
  size_t getBytes(const char* key, void* out, size_t size) {
    if (getBytesLength(key) != size) return 0;
    memcpy(out, keys[key].data(), size);
    if (corruptRead) static_cast<char*>(out)[0] ^= 1;
    return size;
  }
  size_t putBytes(const char* key, const void* data, size_t size) {
    ++writes;
    if (fail) return 0;
    keys[key] = std::string(static_cast<const char*>(data), size); return size;
  }
  bool isKey(const char* key) { return keys.count(key); }
  bool remove(const char* key) { ++writes; return !fail && keys.erase(key); }
};
std::string request(const std::string& extra, const char* token = "test-token") {
  const std::string body = std::string("ssid=Fixture&password=test-only-pass&name=Pilot&latitude=0&longitude=0&token=") + token + extra;
  return "POST /save HTTP/1.1\r\nHost: 192.168.4.1\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: " +
      std::to_string(body.size()) + "\r\n\r\n" + body;
}
void parsing() {
  for (const auto& pair : std::map<std::string, uint32_t>{{"", 0}, {"&sendInterval=", 0},
      {"&sendInterval=60", 60}, {"&sendInterval=300", 300}, {"&sendInterval=86400", 86400}}) {
    Credential network{}; Location location; StationName name; uint32_t seconds = 123;
    const auto text = request(pair.first);
    assert(parse(text.c_str(), text.size(), "test-token", network, &location, &name, &seconds) == Request::Submit);
    assert(seconds == pair.second && location.present && location.latitude == 0 && !strcmp(name.text, "Pilot"));
    assert(!strcmp(network.ssid, "Fixture") && !strcmp(network.password, "test-only-pass"));
  }
  for (const std::string value : {"0", "59", "86401", "-60", "+60", "60.0", "1e3", "0x100", "NaN", "Infinity",
      "%20300", "300%20", "%00", "4294967296", "18446744073709551616", "60&sendInterval=300"}) {
    Credential network{}; Location location; StationName name; uint32_t seconds = 123;
    const auto text = request("&sendInterval=" + value);
    assert(parse(text.c_str(), text.size(), "test-token", network, &location, &name, &seconds) == Request::Reject);
    assert(seconds == 123 && !*network.ssid && !location.present && !*name.text);
  }
  Credential network{}; uint32_t seconds = 123;
  const auto text = request("&sendInterval=60", "wrong-token");
  assert(parse(text.c_str(), text.size(), "test-token", network, nullptr, nullptr, &seconds) == Request::Reject);
  assert(seconds == 123);
  seconds = 123;
  assert(!parseSendInterval("999999999999999999999999999999999999999999", seconds) && seconds == 123);
}
void persistence() {
  Preferences storage; const auto unrelated = storage.keys;
  SendIntervalOverride state; state.load(storage);
  assert(!state.saved() && state.effective(300) == 300 && state.effective(600) == 600);
  assert(state.commit(storage, 60) && state.effective(300) == 60);
  SendIntervalOverride reboot; reboot.load(storage);
  assert(reboot.saved() == 60 && reboot.effective(600) == 60);
  const int writes = storage.writes;
  assert(!state.commit(storage, UINT32_MAX) && storage.writes == writes);
  storage.fail = true;
  assert(!state.commit(storage, 86400) && state.saved() == 60);
  assert(!state.commit(storage, 0) && state.saved() == 60);
  storage.fail = false; storage.corruptRead = true;
  assert(!state.commit(storage, 86400) && state.saved() == 60);
  storage.corruptRead = false;
  reboot.load(storage); assert(reboot.saved() == 60);
  assert(state.commit(storage, 0) && !state.saved() && state.effective(600) == 600);
  reboot.load(storage); assert(!reboot.saved() && reboot.effective(600) == 600);
  assert(storage.keys == unrelated);
  storage.keys["sendSeconds"] = "corrupt";
  reboot.load(storage); assert(!reboot.saved());
  for (uint32_t bad : {uint32_t(0), uint32_t(59), uint32_t(86401), UINT32_MAX}) {
    storage.keys["sendSeconds"] = std::string(reinterpret_cast<const char*>(&bad), sizeof(bad));
    reboot.load(storage); assert(!reboot.saved());
  }
}
struct IntervalDriver : Driver {
  Preferences storage;
  SendIntervalOverride interval;
  uint32_t pending = 0;
  bool networkSaved = true, confirmed = false;
  void disconnect() override {}
  void connect(size_t, bool) override {}
  bool startPortal() override { return true; }
  void stopPortal() override {}
  bool saveCandidate() override { return networkSaved && interval.commit(storage, pending); }
  void result(bool, bool saved) override { confirmed = saved; }
};
void associationGate() {
  for (int scenario = 0; scenario < 8; ++scenario) {
    IntervalDriver driver; Policy policy;
    assert(driver.interval.commit(driver.storage, 600));
    driver.pending = scenario >= 4 ? 0 : 60;
    const int before = driver.storage.writes;
    policy.begin(0, 0, driver); assert(policy.submit(1, driver));
    policy.tick(101, false, false, driver);
    assert(driver.storage.writes == before && driver.interval.saved() == 600);
    const int outcome = scenario % 4;
    driver.networkSaved = outcome != 2; driver.storage.fail = outcome == 3;
    if (!outcome) policy.tick(101 + AttemptMs, false, false, driver);
    else policy.tick(601, true, true, driver);
    assert(driver.confirmed == (outcome == 1));
    assert(driver.interval.effective(300) == (outcome == 1 ? (scenario >= 4 ? 300U : 60U) : 600U));
    if (!outcome || outcome == 2) assert(driver.storage.writes == before);
  }
}
void streamedForm() {
  for (uint32_t saved : {0U, 60U, 86400U}) {
    Preferences storage; SendIntervalOverride interval;
    assert(interval.commit(storage, saved));
    const std::string values = std::string("test-token") + portal_assets::FormMiddle + "Pilot" +
        portal_assets::FormInterval + (saved ? std::to_string(saved) : "") + portal_assets::FormEffective +
        std::to_string(interval.effective(600)) + portal_assets::FormDefault + "600";
    ResponseStream stream;
    stream.begin(nullptr, 0, portal_assets::FormStart, sizeof(portal_assets::FormStart) - 1,
        values.c_str(), values.size(), portal_assets::FormEnd, sizeof(portal_assets::FormEnd) - 1);
    std::string html;
    while (stream.active()) { const size_t n = stream.size(); html.append(stream.data(), n); assert(stream.advance(n)); }
    assert(html.find("{{") == std::string::npos);
    assert(html.find("step=\"1\" value=\"" + (saved ? std::to_string(saved) : "") + "\"") != std::string::npos);
    assert(html.find("Current effective interval: " + std::to_string(interval.effective(600)) + " seconds") != std::string::npos);
    assert(html.find("Firmware default: 600 seconds") != std::string::npos);
  }
}
int main() {
  parsing(); persistence(); associationGate(); streamedForm();
  std::cout << "4 send-interval test groups passed (parser/auth/bounds, persistence/reboot/clear, association gate, streamed effective/saved form)\n";
}
