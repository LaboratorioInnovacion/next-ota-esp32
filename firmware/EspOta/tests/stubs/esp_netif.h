#pragma once
struct esp_netif_t {};
constexpr int ESP_OK = 0;
esp_netif_t* esp_netif_get_handle_from_ifkey(const char*);
int esp_netif_get_netif_impl_name(esp_netif_t*, char*);
