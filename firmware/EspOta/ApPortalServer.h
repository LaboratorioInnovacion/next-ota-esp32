#pragma once
#include <WiFi.h>
#include <fcntl.h>
#include "ApSocket.h"

class ApPortalServer {
public:
  bool begin() {
    end();
    socket_ = ::socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (socket_ < 0) return false;
    const int reuse = 1;
    ::setsockopt(socket_, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));
    if (!bindSetupSocket(socket_, 80) || ::listen(socket_, 1) != 0 ||
        ::fcntl(socket_, F_SETFL, O_NONBLOCK) < 0) {
      end(); return false;
    }
    return true;
  }
  void end() { if (socket_ >= 0) ::close(socket_); socket_ = -1; }
  WiFiClient available() {
    const int client = ::accept(socket_, nullptr, nullptr);
    return client < 0 ? WiFiClient() : WiFiClient(client);
  }
private:
  int socket_ = -1;
};
