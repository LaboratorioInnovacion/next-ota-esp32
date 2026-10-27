#pragma once
#include <string.h>

namespace station {
// Match weather ingestion: six colon-separated octets, preserving identity case.
inline bool validMac(const char* text) {
  if (!text || strlen(text) != 17) return false;
  for (unsigned i = 0; i < 17; ++i) {
    const char c = text[i];
    if (i % 3 == 2) { if (c != ':') return false; }
    else if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') ||
               (c >= 'A' && c <= 'F'))) return false;
  }
  return true;
}
class Identity {
public:
  bool configure(const char* overrideMac) {
    override_[0] = 0;
    if (overrideMac && !*overrideMac) return true;
    if (!validMac(overrideMac)) return false;
    memcpy(override_, overrideMac, sizeof(override_));
    return true;
  }
  const char* resolve(const char* hardwareMac) const {
    return override_[0] ? override_ : hardwareMac;
  }
private:
  char override_[18]{};
};
} // namespace station
