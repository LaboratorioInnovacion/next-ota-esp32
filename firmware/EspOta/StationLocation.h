#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <stdlib.h>
#include <math.h>

namespace provisioning {
struct Location {
  bool present = false;
  float latitude = 0, longitude = 0;
};
inline bool coordinate(const char* text, float limit, float& value) {
  // Decimal degrees only, not hex, exponent, whitespace, NaN or infinity.
  const char* p = text;
  if (*p == '-' || *p == '+') ++p;
  bool digit = false, point = false;
  for (; *p; ++p) {
    if (*p >= '0' && *p <= '9') digit = true;
    else if (*p == '.' && !point) point = true;
    else return false;
  }
  if (!digit) return false;
  const double parsed = strtod(text, nullptr);
  if (!isfinite(parsed) || parsed < -limit || parsed > limit) return false;
  value = float(parsed);
  return true;
}
inline bool parseLocation(const char* latitude, const char* longitude, Location& out) {
  out = Location{};
  if (!*latitude && !*longitude) return true;
  if (!coordinate(latitude, 90, out.latitude) || !coordinate(longitude, 180, out.longitude)) return false;
  out.present = true;
  return true;
}
// One small versioned blob: no independent latitude/longitude writes.
struct LocationBlob {
  uint32_t version;
  float latitude, longitude;
  uint32_t checksum;
};
inline uint32_t locationChecksum(const LocationBlob& blob) {
  const auto* bytes = reinterpret_cast<const uint8_t*>(&blob);
  uint32_t hash = 2166136261u;
  for (size_t i = 0; i < offsetof(LocationBlob, checksum); ++i) hash = (hash ^ bytes[i]) * 16777619u;
  return hash;
}
inline bool validLocation(const LocationBlob& blob) {
  return blob.version == 1 && blob.checksum == locationChecksum(blob) &&
      isfinite(blob.latitude) && isfinite(blob.longitude) && fabs(blob.latitude) <= 90 && fabs(blob.longitude) <= 180;
}
class LocationStorage {
public:
  virtual ~LocationStorage() {}
  virtual size_t readLocation(LocationBlob& blob) = 0;
  virtual size_t writeLocation(const LocationBlob& blob) = 0;
};
class StationLocation {
public:
  void load(LocationStorage& storage) {
    LocationBlob blob{};
    if (storage.readLocation(blob) == sizeof(blob) && validLocation(blob)) apply(blob);
  }
  bool commit(LocationStorage& storage, const Location& next) {
    if (!next.present) return true;
    LocationBlob blob{1, next.latitude, next.longitude, 0};
    blob.checksum = locationChecksum(blob);
    if (!validLocation(blob)) return false;
    LocationBlob previous{};
    bool hadPrevious = storage.readLocation(previous) == sizeof(previous) && validLocation(previous);
    if (!hadPrevious && value_.present) {
      previous = LocationBlob{1, value_.latitude, value_.longitude, 0};
      previous.checksum = locationChecksum(previous);
      hadPrevious = true;
    }
    LocationBlob readback{};
    if (storage.writeLocation(blob) != sizeof(blob) || storage.readLocation(readback) != sizeof(blob) ||
        memcmp(&blob, &readback, sizeof(blob))) {
      // Best effort only: a readback failure cannot prove what survived in NVS.
      if (hadPrevious) storage.writeLocation(previous);
      return false;
    }
    apply(blob);
    return true;
  }
  const Location& value() const { return value_; }
private:
  void apply(const LocationBlob& blob) {
    value_.present = true; value_.latitude = blob.latitude; value_.longitude = blob.longitude;
  }
  Location value_;
};
} // namespace provisioning
