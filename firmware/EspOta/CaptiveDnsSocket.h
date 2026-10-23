#pragma once
#include "ApSocket.h"
#include "CaptiveDns.h"

class CaptiveDnsSocket {
public:
  bool openAp() {
    socket_ = ::socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (socket_ < 0) return false;
    // Address binding alone does not enforce the ingress interface in AP+STA.
    if (!bindSetupSocket(socket_, 53)) {
      close(); return false;
    }
    return true;
  }
  void close() { if (socket_ >= 0) ::close(socket_); socket_ = -1; }
  int receive(uint8_t* packet, size_t size, uint32_t& peer) {
    socklen_t length = sizeof(peer_);
    const int received = ::recvfrom(socket_, packet, size, MSG_DONTWAIT,
        reinterpret_cast<sockaddr*>(&peer_), &length);
    peer = ntohl(peer_.sin_addr.s_addr);
    return received;
  }
  void reply(const uint8_t* packet, size_t size) {
    ::sendto(socket_, packet, size, MSG_DONTWAIT, reinterpret_cast<sockaddr*>(&peer_), sizeof(peer_));
  }
private:
  int socket_ = -1;
  sockaddr_in peer_{};
};
