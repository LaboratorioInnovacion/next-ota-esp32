#pragma once

#include "WiFiPolicy.h"

namespace provisioning {
class Storage {
public:
  virtual ~Storage() = default;
  virtual size_t read(size_t slot, Credential& value) = 0;
  virtual bool write(size_t slot, const Credential& value) = 0;
};

// Append-only slots: a failed write/readback never replaces a working key.
// Even malformed occupied slots are preserved rather than silently erased.
class SavedNetworks {
public:
  void load(Storage& storage) {
    count = 0;
    for (size_t slot = 0; slot < MaxNetworks; ++slot) {
      Credential value{};
      const size_t size = storage.read(slot, value);
      occupied_[slot] = size != 0;
      if (size == sizeof(value) && valid(value)) entries[count++] = value;
    }
  }
  bool contains(const Credential& value) const {
    for (size_t i = 0; i < count; ++i) {
      if (!strcmp(entries[i].ssid, value.ssid) &&
          !strcmp(entries[i].password, value.password)) return true;
    }
    return false;
  }
  bool room() const {
    for (size_t slot = 0; slot < MaxNetworks; ++slot) if (!occupied_[slot]) return true;
    return false;
  }
  bool commit(Storage& storage, const Credential& value) {
    if (!valid(value)) return false;
    if (contains(value)) return true;
    for (size_t slot = 0; slot < MaxNetworks; ++slot) {
      if (occupied_[slot]) continue;
      occupied_[slot] = true;
      if (!storage.write(slot, value)) return false;
      Credential verified{};
      if (storage.read(slot, verified) != sizeof(verified) ||
          memcmp(&value, &verified, sizeof(value))) return false;
      entries[count++] = value;
      return true;
    }
    return false;
  }
  Credential entries[MaxNetworks]{};
  size_t count = 0;

private:
  bool occupied_[MaxNetworks]{};
};
} // namespace provisioning
