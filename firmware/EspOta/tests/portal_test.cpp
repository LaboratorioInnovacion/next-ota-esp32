#include "../PortalRequest.h"
#include "../PortalIdentity.h"
#include "../PortalStream.h"
#include <cassert>
#include <iostream>
#include <string>

using namespace provisioning;
Request parseRequest(const std::string& text) {
  Credential out{};
  return parse(text.c_str(), text.size(), "synthetic-test-token", out);
}
void assetRoutes() {
  const char* paths[] = {"/setup.css", "/setup.js"};
  const Request expected[] = {Request::Style, Request::Script};
  for (size_t i = 0; i < 2; ++i) {
    const std::string first = std::string("GET ") + paths[i] + " HTTP/1.1\r\n";
    const std::string request = first + "Host: 192.168.4.1\r\n\r\n";
    assert(parseRequest(request) == expected[i]);
    for (size_t n = 0; n < request.size(); ++n)
      assert(parseRequest(request.substr(0, n)) == Request::Incomplete);
    for (const char* bad : {"Host: evil.example\r\n", "Host: 192.168.4.1\r\nOrigin: https://evil.example\r\n",
                           "Host: 192.168.4.1\r\nHost: 192.168.4.1\r\n",
                           "Host: 192.168.4.1\r\nTransfer-Encoding: chunked\r\n"})
      assert(parseRequest(first + bad + "\r\n") == Request::Reject);
    assert(parseRequest(first + "Host: 192.168.4.1\r\nContent-Length: 1\r\n\r\nx") == Request::Reject);
    assert(parseRequest(request + "x") == Request::Reject);
    assert(parseRequest(std::string("POST ") + paths[i] + " HTTP/1.1\r\nHost: 192.168.4.1\r\n\r\n") == Request::Reject);
  }
  for (const char* path : {"/wifi-qr.js", "/qr-decoder.js", "/qr-decoder.js?x"})
    assert(parseRequest(std::string("GET ") + path + " HTTP/1.1\r\nHost: 192.168.4.1\r\n\r\n") == Request::Reject);
}
void stablePublicName() {
  uint8_t mac[6] = {0x02, 0x11, 0x22, 0x33, 0x0a, 0xbc};
  char name[20]; setupName(name, mac);
  assert(std::string(name) == "estacionm-nodo-0abc");
  mac[0] = 0xff; setupName(name, mac);
  assert(std::string(name) == "estacionm-nodo-0abc");
  mac[5] = 0; setupName(name, mac);
  assert(std::string(name) == "estacionm-nodo-0a00" && strlen(name) <= 32);
}
void boundedStreaming() {
  ResponseStream stream;
  assert(!stream.active() && !stream.size());
  const std::string large(130267, 'x');
  stream.begin("HEAD", 4, large.data(), large.size(), "TOKEN", 5, "END", 3);
  std::string received;
  while (stream.active()) {
    assert(stream.size() <= 512);
    const char* before = stream.data();
    assert(stream.advance(0) && before == stream.data()); // Backpressure.
    assert(!stream.advance(stream.size() + 1));
    const size_t count = stream.size() > 7 ? 7 : stream.size(); // Partial send.
    received.append(stream.data(), count);
    assert(stream.advance(count));
  }
  assert(received == "HEAD" + large + "TOKENEND");
  stream.begin(nullptr, 0, large.data(), large.size(), nullptr, 0, nullptr, 0);
  assert(stream.data() == large.data()); // Non-owning flash slice.
  stream.clear(); assert(!stream.active());
  stream.begin(nullptr, 0, nullptr, 0, nullptr, 0, nullptr, 0);
  assert(!stream.active());
}
int main() {
  assetRoutes(); stablePublicName(); boundedStreaming();
  std::cout << "3 portal behavioral tests passed\n";
}
