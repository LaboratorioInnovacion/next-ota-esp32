#pragma once
#include <stdint.h>
#include <string.h>

namespace provisioning {
constexpr uint32_t DefaultSendIntervalSeconds = 300;
constexpr uint32_t MinSendIntervalSeconds = 60;
constexpr uint32_t MaxSendIntervalSeconds = 86400;
inline constexpr bool validSendInterval(uint32_t seconds) {
  return seconds >= MinSendIntervalSeconds && seconds <= MaxSendIntervalSeconds;
}
// Zero represents a cleared override, never an effective scheduling interval.
inline bool parseSendInterval(const char* text, uint32_t& seconds) {
  uint32_t parsed = 0;
  for (const char* p = text; *p; ++p) {
    if (*p < '0' || *p > '9') return false;
    const uint32_t digit = uint32_t(*p - '0');
    if (parsed > (MaxSendIntervalSeconds - digit) / 10) return false;
    parsed = parsed * 10 + digit;
  }
  if (*text && !validSendInterval(parsed)) return false;
  seconds = parsed;
  return true;
}
class SendIntervalOverride {
public:
  template<class Preferences> void load(Preferences& storage) {
    value_ = 0;
    uint32_t stored = 0;
    if (storage.getBytesLength("sendSeconds") == sizeof(stored) &&
        storage.getBytes("sendSeconds", &stored, sizeof(stored)) == sizeof(stored) &&
        validSendInterval(stored)) value_ = stored;
  }
  template<class Preferences> bool commit(Preferences& storage, uint32_t next) {
    if (next && !validSendInterval(next)) return false;
    if (!write(storage, next)) {
      write(storage, value_); // Best effort only; NVS keys are not a transaction.
      return false;
    }
    value_ = next;
    return true;
  }
  uint32_t saved() const { return value_; }
  uint32_t effective(uint32_t firmware) const { return value_ ? value_ : firmware; }
private:
  template<class Preferences> bool write(Preferences& storage, uint32_t next) {
    if (!next) return !storage.isKey("sendSeconds") ||
        (storage.remove("sendSeconds") && !storage.isKey("sendSeconds"));
    uint32_t readback = 0;
    return storage.putBytes("sendSeconds", &next, sizeof(next)) == sizeof(next) &&
        storage.getBytes("sendSeconds", &readback, sizeof(readback)) == sizeof(readback) && readback == next;
  }
  uint32_t value_ = 0;
};
} // namespace provisioning
