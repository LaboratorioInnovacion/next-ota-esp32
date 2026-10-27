#include "../PortalRequest.h"
#include "../CaptiveDns.h"
#include "../ApSocket.h"
#include <assert.h>
#include <iostream>
#include <string>
#include <vector>
using namespace provisioning;

namespace {
bool hasAp = true, nameOK = true, deviceOK = true, addressOK = true;
int deviceCalls = 0, addressCalls = 0;
}
esp_netif_t* esp_netif_get_handle_from_ifkey(const char* key) {
  assert(!strcmp(key, "WIFI_AP_DEF"));
  static esp_netif_t ap;
  return hasAp ? &ap : nullptr;
}
int esp_netif_get_netif_impl_name(esp_netif_t*, char* name) { strcpy(name, "ap1"); return nameOK ? ESP_OK : -1; }
int testSetsockopt(int fd, int level, int option, const void* value, socklen_t size) {
  ++deviceCalls;
  assert(fd == 42 && level == SOL_SOCKET && option == SO_BINDTODEVICE && size == sizeof(ifreq));
  assert(!strcmp(static_cast<const ifreq*>(value)->ifr_name, "ap1"));
  return deviceOK ? 0 : -1;
}
int testBind(int fd, const sockaddr* value, socklen_t size) {
  ++addressCalls;
  const auto& address = *reinterpret_cast<const sockaddr_in*>(value);
  assert(fd == 42 && size == sizeof(address) && address.sin_family == AF_INET);
  assert(ntohl(address.sin_addr.s_addr) == 0xc0a80401 && ntohs(address.sin_port) == 53);
  return addressOK ? 0 : -1;
}
struct Metadata : LocationStorage {
  LocationBlob stored{};
  bool exists = false, failWrite = false, failRead = false, corruptRead = false;
  int writes = 0;
  size_t readLocation(LocationBlob& out) override {
    if (!exists || (failRead && writes)) return 0;
    out = stored;
    if (corruptRead && writes) out.checksum ^= 1;
    return sizeof(out);
  }
  size_t writeLocation(const LocationBlob& next) override {
    ++writes;
    if (failWrite) return 0;
    stored = next; exists = true; return sizeof(next);
  }
  bool clearLocation() override {
    ++writes;
    if (failWrite) return false;
    exists = false;
    return true;
  }
};
std::string post(const std::string& extra) {
  const std::string body = "ssid=Fixture&password=test-only-pass&token=test-token" + extra;
  return "POST /save HTTP/1.1\r\nHost: 192.168.4.1\r\nOrigin: http://192.168.4.1\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: " +
      std::to_string(body.size()) + "\r\n\r\n" + body;
}
Request parseText(const std::string& text, Location* out = nullptr) {
  Credential credential{};
  return parse(text.c_str(), text.size(), "test-token", credential, out);
}
void locationParsing() {
  Location out;
  assert(parseLocation("", "", out) && !out.present);
  for (const auto& pair : std::vector<std::pair<std::string, std::string>>{
      {"0", "0"}, {"-90", "180"}, {"90", "-180"}, {"-34.5", "-58.25"}, {"+.5", "-.5"}}) {
    assert(parseLocation(pair.first.c_str(), pair.second.c_str(), out) && out.present);
  }
  for (const auto& pair : std::vector<std::pair<std::string, std::string>>{
      {"", "0"}, {"0", ""}, {"90.00001", "0"}, {"0", "-180.01"}, {"NaN", "0"},
      {"inf", "0"}, {"0x1", "0"}, {"1e1", "0"}, {"1,5", "0"}, {" ", " "}, {"1.2.3", "0"}, {"+", "0"}})
    assert(!parseLocation(pair.first.c_str(), pair.second.c_str(), out));
}
void locationPersistence() {
  Metadata memory;
  StationLocation state;
  state.load(memory);
  assert(!state.value().present);
  Location first; assert(parseLocation("-34.5", "-58.25", first));
  assert(state.commit(memory, first));
  StationLocation reboot; reboot.load(memory);
  assert(reboot.value().present && reboot.value().latitude == -34.5f && reboot.value().longitude == -58.25f);
  const int writes = memory.writes;
  assert(state.commit(memory, Location{}) && memory.writes == writes + 1);
  assert(!memory.exists && !state.value().present);
  StationLocation clearedBoot; clearedBoot.load(memory);
  assert(!clearedBoot.value().present);
  const Location fallback = effectiveLocation(12.5f, -45.25f, clearedBoot.value());
  assert(fallback.present && fallback.latitude == 12.5f && fallback.longitude == -45.25f);
  Location zero; assert(parseLocation("0", "0", zero));
  assert(state.commit(memory, zero) && state.value().present && state.value().latitude == 0 && state.value().longitude == 0);
  StationLocation zeroBoot; zeroBoot.load(memory); assert(zeroBoot.value().present && zeroBoot.value().latitude == 0);
  const Location effective = effectiveLocation(12.5f, -45.25f, zeroBoot.value());
  assert(effective.present && effective.latitude == 0 && effective.longitude == 0);
  memory.stored.version = 2;
  StationLocation corrupt; corrupt.load(memory); assert(!corrupt.value().present);
  for (int fault = 0; fault < 3; ++fault) {
    memory.stored = LocationBlob{1, 0, 0, 0};
    if (fault == 1) memory.stored.longitude = 181;
    if (fault == 2) memory.stored.latitude = NAN;
    memory.stored.checksum = locationChecksum(memory.stored);
    if (fault == 0) memory.stored.checksum ^= 1;
    StationLocation invalid; invalid.load(memory); assert(!invalid.value().present);
  }
}
void locationFailures() {
  {
    Metadata memory; StationLocation state;
    Location old; assert(parseLocation("1", "2", old)); assert(state.commit(memory, old));
    memory.failWrite = true;
    assert(!state.commit(memory, Location{}));
    assert(state.value().present && state.value().latitude == 1 && memory.exists);
    StationLocation reboot; reboot.load(memory);
    assert(reboot.value().present && reboot.value().longitude == 2);
  }
  for (int failure = 0; failure < 3; ++failure) {
    Metadata memory; StationLocation state;
    Location old; assert(parseLocation("-34", "-58", old)); assert(state.commit(memory, old));
    Location next; assert(parseLocation("0", "0", next));
    memory.failWrite = failure == 0; memory.failRead = failure == 1; memory.corruptRead = failure == 2;
    assert(!state.commit(memory, next));
    assert(state.value().latitude == -34 && state.value().longitude == -58);
    // Previously verified active value also supports best-effort rollback when
    // the initial storage read fails. A real failed rollback remains uncertain.
    assert(memory.stored.latitude == -34);
  }
  Metadata memory; StationLocation state;
  Location old; assert(parseLocation("1", "2", old)); assert(state.commit(memory, old));
  // Fail only the verification read, after the previous blob was captured.
  struct VerificationFailure : Metadata {
    int reads = 0;
    size_t readLocation(LocationBlob& out) override {
      if (++reads == 2) return 0;
      return Metadata::readLocation(out);
    }
  } verification;
  verification.stored = memory.stored; verification.exists = true;
  Location next; assert(parseLocation("3", "4", next));
  assert(!state.commit(verification, next));
  assert(verification.stored.latitude == 1 && state.value().latitude == 1);
}
void formLocation() {
  Location out;
  assert(parseText(post("&latitude=0&longitude=0"), &out) == Request::Submit && out.present && out.latitude == 0);
  assert(parseText(post("&latitude=-34.25&longitude=-58.5"), &out) == Request::Submit && out.longitude == -58.5f);
  assert(parseText(post("&latitude=&longitude="), &out) == Request::Submit && !out.present);
  for (const std::string extra : {"&latitude=1", "&longitude=1", "&latitude=nan&longitude=0",
      "&latitude=91&longitude=0", "&latitude=0&longitude=181", "&latitude=0&longitude=0&latitude=1",
      "&latitude=%00&longitude=0", "&latitude=1234567890123456789012345&longitude=0"})
    assert(parseText(post(extra)) == Request::Reject);
  assert(parseText(post("&latitude=" + std::string(512, '0') + "&longitude=0")) == Request::Reject);
}
void captiveRoutes() {
  assert(!strcmp(CaptiveRedirect, "HTTP/1.1 302 Found\r\nLocation: http://192.168.4.1/\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"));
  for (const std::string path : {"/generate_204", "/gen_204", "/hotspot-detect.html", "/connecttest.txt", "/ncsi.txt"}) {
    assert(parseText("GET " + path + " HTTP/1.1\r\nHost: captive.example\r\n\r\n") == Request::Captive);
    assert(parseText("GET " + path + " HTTP/1.1\r\nHost: 192.168.4.1\r\n\r\n") == Request::Captive);
    assert(parseText("GET " + path + " HTTP/1.0\r\nHost: captive.example\r\n\r\n") == Request::Captive);
  }
  assert(parseText("GET / HTTP/1.1\r\nHost: captive.example\r\n\r\n") == Request::Captive);
  assert(parseText("GET / HTTP/1.1\r\nHost: 192.168.4.1\r\n\r\n") == Request::Form);
  for (const std::string text : {"POST /generate_204 HTTP/1.1\r\nHost: captive.example\r\n\r\n",
      "GET /setup.js HTTP/1.1\r\nHost: captive.example\r\n\r\n", "GET / HTTP/1.1\r\nHost: evil/path\r\n\r\n",
      "GET /gen_204 HTTP/1.1\r\nHost: captive.example\r\nHost: 192.168.4.1\r\n\r\n",
      "GET /gen_204 HTTP/1.1\r\nHost: captive.example\r\nContent-Length: 1\r\n\r\nx",
      "GET /gen_204 HTTP/1.1\r\nHost: captive.example\r\nOrigin: http://evil.example\r\n\r\n"})
    assert(parseText(text) == Request::Reject);
  std::string foreign = post("&latitude=0&longitude=0");
  foreign.replace(foreign.find("Host: 192.168.4.1"), 17, "Host: evil.example");
  assert(parseText(foreign) == Request::Reject);
}
std::vector<uint8_t> query(uint8_t type = 1) {
  return {0x12, 0x34, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 3, 'w', 'w', 'w', 7,
      'e', 'x', 'a', 'm', 'p', 'l', 'e', 0, 0, type, 0, 1};
}
size_t answer(std::vector<uint8_t> data) {
  uint8_t buffer[DnsLimit + 16]{};
  assert(data.size() <= sizeof(buffer));
  if (!data.empty()) memcpy(buffer, data.data(), data.size());
  return captiveDns(buffer, data.size(), sizeof(buffer));
}
void dnsPackets() {
  auto request = query();
  uint8_t buffer[DnsLimit + 16]{}; memcpy(buffer, request.data(), request.size());
  assert(captiveDns(buffer, request.size(), sizeof(buffer)) == request.size() + 16);
  assert(buffer[0] == 0x12 && buffer[1] == 0x34 && buffer[2] == 0x85 && buffer[3] == 0 && buffer[7] == 1);
  assert(!memcmp(buffer + request.size() + 12, "\xc0\xa8\x04\x01", 4));
  assert(answer(query(28)) == request.size());
  for (size_t length = 0; length < request.size(); ++length)
    assert(!answer(std::vector<uint8_t>(request.begin(), request.begin() + length)));
  for (size_t index : {size_t(2), size_t(3), size_t(4), size_t(5), size_t(6), size_t(8), size_t(10), size_t(12)}) {
    auto bad = request; bad[index] = 0xff; assert(!answer(bad));
  }
  auto compressed = request; compressed[12] = 0xc0; compressed[13] = 12; assert(!answer(compressed));
  assert(!answer(query(255)));
  request.push_back(0); assert(!answer(request));
  assert(!answer(std::vector<uint8_t>(DnsLimit + 1, 0)));
  // Deterministic hostile inputs execute the parser under ASan/UBSan.
  uint32_t seed = 1;
  for (size_t i = 0; i < 1000; ++i) {
    std::vector<uint8_t> bytes(i % (DnsLimit + 1));
    for (auto& byte : bytes) { seed = seed * 1664525u + 1013904223u; byte = uint8_t(seed >> 24); }
    answer(bytes);
  }
}
struct DnsTransport {
  bool openOK = true;
  int opens = 0, closes = 0, reads = 0, replies = 0;
  uint32_t peer = 0xc0a80402;
  std::vector<uint8_t> data = query();
  bool openAp() { ++opens; return openOK; }
  void close() { ++closes; }
  int receive(uint8_t* out, size_t capacity, uint32_t& address) {
    ++reads; assert(capacity == DnsLimit + 1); address = peer;
    memcpy(out, data.data(), data.size()); return int(data.size());
  }
  void reply(const uint8_t*, size_t size) { assert(size == query().size() + 16); ++replies; }
};
void dnsLifecycle() {
  CaptiveDnsService<DnsTransport> service; DnsTransport transport;
  service.loop(transport); assert(!transport.reads);
  assert(service.start(transport)); service.loop(transport);
  assert(transport.reads == 1 && transport.replies == 1);
  for (uint32_t peer : {0xc0a80102u, 0xc0a80401u, 0xc0a80400u, 0xc0a804ffu}) {
    transport.peer = peer; service.loop(transport);
  }
  assert(transport.replies == 1);
  transport.peer = 0xc0a80402; transport.data.resize(DnsLimit + 1); service.loop(transport);
  assert(transport.replies == 1);
  service.stop(transport); const int reads = transport.reads;
  service.loop(transport); assert(transport.reads == reads && transport.closes == 2);
  transport.openOK = false; assert(!service.start(transport)); service.loop(transport);
  assert(transport.reads == reads && transport.closes == 4);
}
void interfaceBinding() {
  assert(bindSetupSocket(42, 53)); assert(deviceCalls == 1 && addressCalls == 1);
  hasAp = false; assert(!bindSetupSocket(42, 53)); assert(deviceCalls == 1); hasAp = true;
  nameOK = false; assert(!bindSetupSocket(42, 53)); assert(deviceCalls == 1); nameOK = true;
  deviceOK = false; assert(!bindSetupSocket(42, 53)); assert(addressCalls == 1); deviceOK = true;
  addressOK = false; assert(!bindSetupSocket(42, 53)); assert(addressCalls == 2);
}
struct LocationDriver : Driver {
  Metadata metadata;
  StationLocation location;
  Location pending;
  int saves = 0, closes = 0;
  bool savedResult = false, networkSaveOK = true;
  void disconnect() override {}
  void connect(size_t, bool) override {}
  bool startPortal() override { return true; }
  void stopPortal() override { ++closes; }
  bool saveCandidate() override { ++saves; return networkSaveOK && location.commit(metadata, pending); }
  void result(bool, bool saved) override { savedResult = saved; pending = Location{}; }
};
void associationGate() {
  for (int scenario = 0; scenario < 8; ++scenario) {
    const bool clear = scenario >= 4;
    const int outcome = scenario % 4;
    LocationDriver driver; Policy policy;
    Location previous; assert(parseLocation("1", "2", previous)); assert(driver.location.commit(driver.metadata, previous));
    const int before = driver.metadata.writes;
    assert(parseLocation(clear ? "" : "0", clear ? "" : "0", driver.pending));
    policy.begin(0, 0, driver); assert(policy.submit(1, driver));
    policy.tick(101, false, false, driver);
    assert(driver.metadata.writes == before && driver.location.value().latitude == 1);
    if (outcome == 0) {
      policy.tick(101 + AttemptMs, false, false, driver);
      assert(!driver.saves && !driver.savedResult && driver.metadata.writes == before);
    } else {
      driver.networkSaveOK = outcome != 2;
      driver.metadata.failWrite = outcome == 3;
      policy.tick(601, true, true, driver);
      assert(driver.saves == 1 && driver.closes == 1);
      assert(driver.savedResult == (outcome == 1));
      if (outcome == 1 && clear) assert(!driver.location.value().present && !driver.metadata.exists);
      else assert(driver.location.value().latitude == (outcome == 1 ? 0 : 1));
      if (outcome == 2) assert(driver.metadata.writes == before);
    }
  }
}
int main() {
  locationParsing(); locationPersistence(); locationFailures(); formLocation();
  captiveRoutes(); dnsPackets(); dnsLifecycle(); interfaceBinding(); associationGate();
  std::cout << "9 onboarding test groups passed (including 1000 malformed DNS packets)\n";
}
