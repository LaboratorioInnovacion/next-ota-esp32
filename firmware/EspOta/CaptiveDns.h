#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>

namespace provisioning {
constexpr size_t DnsLimit = 288;
// Single plain IN question; compressed names, EDNS and all extra records are
// dropped, not followed. There is no recursion or external lookup.
inline size_t captiveDns(uint8_t* packet, size_t size, size_t capacity) {
  if (size < 17 || size > DnsLimit || capacity < size + 16 ||
      (packet[2] & 0xfe) || (packet[3] & 0xef) || packet[4] || packet[5] != 1) return 0;
  for (size_t i = 6; i < 12; ++i) if (packet[i]) return 0;
  size_t p = 12;
  while (p < size && packet[p]) {
    const size_t label = packet[p++];
    if (label > 63 || label > size - p || p + label - 12 > 253) return 0;
    for (size_t i = 0; i < label; ++i) {
      const uint8_t c = packet[p + i];
      if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
            (c >= '0' && c <= '9') || c == '-' || c == '_')) return 0;
    }
    p += label;
  }
  if (p == 12 || p >= size || p + 5 != size || packet[p + 1] ||
      (packet[p + 2] != 1 && packet[p + 2] != 28) || packet[p + 3] || packet[p + 4] != 1) return 0;
  const bool ipv4 = packet[p + 2] == 1;
  packet[2] = uint8_t(0x84 | (packet[2] & 1)); // authoritative, echo RD; never RA
  packet[3] = 0;
  packet[7] = ipv4 ? 1 : 0;
  if (!ipv4) return size; // AAAA: valid empty answer, not a false IPv6 record
  const uint8_t answer[] = {0xc0, 12, 0, 1, 0, 1, 0, 0, 0, 0, 0, 4, 192, 168, 4, 1};
  memcpy(packet + size, answer, sizeof(answer));
  return size + sizeof(answer);
}
inline bool apPeer(uint32_t hostOrderAddress) {
  return (hostOrderAddress & 0xffffff00u) == 0xc0a80400u &&
      (hostOrderAddress & 255) > 1 && (hostOrderAddress & 255) < 255;
}
// Transport must fail closed unless BOTH device and local address are bound.
template<class Transport> class CaptiveDnsService {
public:
  bool start(Transport& transport) {
    stop(transport);
    active_ = transport.openAp();
    if (!active_) transport.close();
    return active_;
  }
  void stop(Transport& transport) { active_ = false; transport.close(); }
  void loop(Transport& transport) {
    if (!active_) return;
    uint8_t packet[DnsLimit + 16];
    uint32_t peer = 0;
    const int received = transport.receive(packet, DnsLimit + 1, peer);
    if (received <= 0 || received > int(DnsLimit) || !apPeer(peer)) return;
    const size_t reply = captiveDns(packet, size_t(received), sizeof(packet));
    if (reply) transport.reply(packet, reply);
  }
private:
  bool active_ = false;
};
} // namespace provisioning
