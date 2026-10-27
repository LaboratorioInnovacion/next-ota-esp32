#include "../PortalRequest.h"
#include "../PortalAssets.h"
#include "../PortalStream.h"
#include <assert.h>
#include <iostream>
#include <map>
#include <string>
#include <vector>
using namespace provisioning;

// Preferences API mock: unrelated keys survive every name operation.
struct Preferences {
  std::map<std::string, std::string> keys{{"location", "paired-coordinates"}, {"setup-pass", "test-only"}};
  bool fail = false, corruptRead = false;
  int writes = 0;
  size_t getBytesLength(const char* key) { return keys.count(key) ? keys[key].size() : 0; }
  size_t getBytes(const char* key, void* out, size_t size) {
    if (getBytesLength(key) != size) return 0;
    memcpy(out, keys[key].data(), size);
    if (corruptRead && !strcmp(key, "stationName")) static_cast<char*>(out)[0] ^= 1;
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
  const std::string body = std::string("ssid=Fixture&password=test-only-pass&token=") + token + extra;
  return "POST /save HTTP/1.1\r\nHost: 192.168.4.1\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: " +
      std::to_string(body.size()) + "\r\n\r\n" + body;
}
void parsing() {
  for (const auto& pair : std::map<std::string, std::string>{
      {"", ""}, {"&name=", ""}, {"&name=++", ""},
      {"&name=+Estaci%C3%B3n+%22Norte%22+%5C+patio+", "Estación \"Norte\" \\ patio"}}) {
    Credential network{}; Location location; StationName name;
    const auto text = request(pair.first + "&latitude=0&longitude=0");
    assert(parse(text.c_str(), text.size(), "test-token", network, &location, &name) == Request::Submit);
    assert(!strcmp(name.text, pair.second.c_str()) && location.present && location.latitude == 0);
    assert(!strcmp(network.ssid, "Fixture") && !strcmp(network.password, "test-only-pass"));
  }
  for (const std::string& extra : std::vector<std::string>{"&name=a&name=b", "&name=a%0Ab", "&name=%7F", "&name=%C2%85",
      "&name=%C0%AF", "&name=%ED%A0%80", "&name=%F4%90%80%80", "&name=%C3", "&name=%00", "&name=%zz",
      "&name=Valid&latitude=1", "&name=" + std::string(65, 'x')}) {
    Credential network{}; Location location; StationName name;
    assert(parseStationName("Previous", name));
    const auto text = request(extra);
    assert(parse(text.c_str(), text.size(), "test-token", network, &location, &name) == Request::Reject);
    assert(!strcmp(name.text, "Previous") && !location.present);
  }
  Credential network{}; StationName name;
  const auto unauthorized = request("&name=Changed", "wrong-token");
  assert(parse(unauthorized.c_str(), unauthorized.size(), "test-token", network, nullptr, &name) == Request::Reject);
  assert(!*name.text);
  const std::string limit(64, 'x'); assert(parseStationName(limit.c_str(), name));
  const std::string utf8 = std::string(62, 'x') + "é"; assert(parseStationName(utf8.c_str(), name));
  assert(!parseStationName((utf8 + "é").c_str(), name));
}
void persistence() {
  Preferences storage; StationNameOverride state; state.load(storage);
  assert(!strcmp(state.effective("Firmware"), "Firmware") && !*state.saved());
  StationName next; assert(parseStationName(" Estación \"Norte\" \\ patio ", next));
  assert(state.commit(storage, next));
  StationNameOverride reboot; reboot.load(storage);
  assert(!strcmp(reboot.saved(), next.text) && !strcmp(reboot.effective("Firmware"), next.text));
  storage.fail = true;
  assert(!state.commit(storage, StationName{}));
  assert(!strcmp(state.saved(), next.text));
  StationName other; assert(parseStationName("Other", other));
  assert(!state.commit(storage, other));
  storage.fail = false;
  StationNameOverride failedBoot; failedBoot.load(storage); assert(!strcmp(failedBoot.saved(), next.text));
  storage.corruptRead = true;
  assert(!state.commit(storage, other) && !strcmp(state.saved(), next.text));
  storage.corruptRead = false;
  failedBoot.load(storage); assert(!strcmp(failedBoot.saved(), next.text));
  assert(state.commit(storage, StationName{}));
  assert(!storage.isKey("stationName") && !*state.saved() && !strcmp(state.effective("Firmware"), "Firmware"));
  StationNameOverride clearedBoot; clearedBoot.load(storage);
  assert(!strcmp(clearedBoot.effective("Firmware"), "Firmware"));
  assert(storage.keys["location"] == "paired-coordinates" && storage.keys["setup-pass"] == "test-only");
  storage.keys["stationName"] = "corrupt";
  clearedBoot.load(storage); assert(!*clearedBoot.saved());
}
void encoding() {
  assert(jsonString<std::string>("Estación \"Norte\" \\ patio\n") == "Estación \\\"Norte\\\" \\\\ patio\\u000a");
  assert(htmlAttribute<std::string>("\"<&' estación>") == "&quot;&lt;&amp;&#39; estación&gt;");
}
struct NameDriver : Driver {
  Preferences storage;
  StationNameOverride name;
  StationName pending;
  bool networkSaved = true, confirmed = false;
  void disconnect() override {}
  void connect(size_t, bool) override {}
  bool startPortal() override { return true; }
  void stopPortal() override {}
  bool saveCandidate() override { return networkSaved && name.commit(storage, pending); }
  void result(bool, bool saved) override { confirmed = saved; }
};
void associationGate() {
  for (int scenario = 0; scenario < 8; ++scenario) {
    NameDriver driver; Policy policy;
    StationName previous; assert(parseStationName("Previous", previous));
    assert(driver.name.commit(driver.storage, previous));
    assert(parseStationName(scenario >= 4 ? "" : "Next", driver.pending));
    const int before = driver.storage.writes;
    policy.begin(0, 0, driver); assert(policy.submit(1, driver));
    policy.tick(101, false, false, driver);
    assert(driver.storage.writes == before && !strcmp(driver.name.saved(), "Previous"));
    const int outcome = scenario % 4;
    driver.networkSaved = outcome != 2; driver.storage.fail = outcome == 3;
    if (!outcome) policy.tick(101 + AttemptMs, false, false, driver);
    else policy.tick(601, true, true, driver);
    assert(driver.confirmed == (outcome == 1));
    assert(!strcmp(driver.name.effective("Firmware"), outcome == 1 ? (scenario >= 4 ? "Firmware" : "Next") : "Previous"));
    if (!outcome || outcome == 2) assert(driver.storage.writes == before);
  }
}
void prefill() {
  Preferences storage; StationNameOverride state;
  StationName name; assert(parseStationName("Estación \"<Norte>\" & patio", name));
  assert(state.commit(storage, name));
  for (int cleared = 0; cleared < 2; ++cleared) {
    if (cleared) assert(state.commit(storage, StationName{}));
    StationNameOverride boot; boot.load(storage);
    const std::string values = std::string("test-token") + portal_assets::FormMiddle + htmlAttribute<std::string>(boot.saved());
    ResponseStream stream;
    stream.begin(nullptr, 0, portal_assets::FormStart, sizeof(portal_assets::FormStart) - 1,
        values.c_str(), values.size(), portal_assets::FormEnd, sizeof(portal_assets::FormEnd) - 1);
    std::string rendered;
    while (stream.active()) { const size_t n = stream.size(); rendered.append(stream.data(), n); assert(stream.advance(n)); }
    assert(rendered.find("name=\"token\" value=\"test-token\"") != std::string::npos);
    assert(rendered.find(cleared ? "name=\"name\" value=\"\"" :
        "name=\"name\" value=\"Estación &quot;&lt;Norte&gt;&quot; &amp; patio\"") != std::string::npos);
    assert(rendered.find("{{NAME}}") == std::string::npos && rendered.find("{{TOKEN}}") == std::string::npos);
    assert(rendered.find("Firmware") == std::string::npos);
  }
}
int main() {
  parsing(); persistence(); encoding(); associationGate(); prefill();
  std::cout << "5 station-name test groups passed (parser/auth, Preferences persistence, escaping, association gate, streamed prefill)\n";
}
