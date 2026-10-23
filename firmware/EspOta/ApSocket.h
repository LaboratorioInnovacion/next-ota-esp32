#pragma once
#include <esp_netif.h>
#include <lwip/sockets.h>
#include <lwip/inet.h>
#include <unistd.h>

// Shared fail-closed binding for HTTP and DNS. Never fall back to ANY/STA.
inline bool bindSetupSocket(int socket, uint16_t port) {
#ifdef SO_BINDTODEVICE
  esp_netif_t* ap = esp_netif_get_handle_from_ifkey("WIFI_AP_DEF");
  struct ifreq device{};
  if (!ap || esp_netif_get_netif_impl_name(ap, device.ifr_name) != ESP_OK) return false;
  sockaddr_in local{};
  local.sin_family = AF_INET;
  local.sin_port = htons(port);
  local.sin_addr.s_addr = inet_addr("192.168.4.1");
  return ::setsockopt(socket, SOL_SOCKET, SO_BINDTODEVICE, &device, sizeof(device)) == 0 &&
      ::bind(socket, reinterpret_cast<sockaddr*>(&local), sizeof(local)) == 0;
#else
  (void)socket; (void)port;
  return false;
#endif
}
