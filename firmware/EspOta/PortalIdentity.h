#pragma once
#include <stdint.h>
#include <stdio.h>

namespace provisioning {
// Public station MAC suffix only; unrelated to the protected setup password.
inline void setupName(char (&name)[20], const uint8_t (&mac)[6]) {
  snprintf(name, sizeof(name), "estacionm-nodo-%02x%02x", mac[4], mac[5]);
}
}
