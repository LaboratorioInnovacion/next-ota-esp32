#pragma once

#include <stddef.h>
#include <stdint.h>
#include <string.h>

namespace provisioning {
constexpr uint32_t AttemptMs = 10000;
constexpr uint32_t RetryMs = 30000;
constexpr uint32_t WindowMs = 600000;
constexpr uint32_t CooldownMs = 300000;
constexpr size_t MaxNetworks = 5;

inline bool elapsed(uint32_t now, uint32_t since, uint32_t interval) {
  return uint32_t(now - since) >= interval;
}

struct Credential {
  char ssid[33] = {};
  char password[64] = {};
};

// Only WPA passphrases are accepted. Open networks and raw 64-digit PSKs
// are intentionally unsupported; lengths are bytes, not Unicode characters.
inline bool valid(const char* ssid, size_t ssidLength,
                  const char* password, size_t passwordLength) {
  if (!ssid || !password || ssidLength == 0 || ssidLength > 32 ||
      passwordLength < 8 || passwordLength > 63) return false;
  for (size_t i = 0; i < ssidLength; ++i) {
    if (static_cast<unsigned char>(ssid[i]) < 32 || ssid[i] == 127) return false;
  }
  for (size_t i = 0; i < passwordLength; ++i) {
    if (static_cast<unsigned char>(password[i]) < 32 ||
        static_cast<unsigned char>(password[i]) > 126) return false;
  }
  return true;
}

// A nonempty override always wins, including invalid overrides (fail closed).
// Without an override, accept only the original persisted random-hex format.
inline const char* selectSetupPassword(const char* configured, const char* stored) {
  if (configured && configured[0]) {
    return valid("setup", 5, configured, strlen(configured)) ? configured : nullptr;
  }
  if (!stored || strlen(stored) != 32) return nullptr;
  for (size_t i = 0; i < 32; ++i) {
    if (!((stored[i] >= '0' && stored[i] <= '9') ||
          (stored[i] >= 'a' && stored[i] <= 'f') ||
          (stored[i] >= 'A' && stored[i] <= 'F'))) return nullptr;
  }
  return stored;
}

inline bool assign(Credential& out, const char* ssid, size_t sn,
                   const char* password, size_t pn) {
  if (!valid(ssid, sn, password, pn)) return false;
  out = Credential{};
  memcpy(out.ssid, ssid, sn);
  memcpy(out.password, password, pn);
  return true;
}

inline bool valid(const Credential& c) {
  const size_t sn = strnlen(c.ssid, sizeof(c.ssid));
  const size_t pn = strnlen(c.password, sizeof(c.password));
  return valid(c.ssid, sn, c.password, pn);
}

class Driver {
public:
  virtual ~Driver() = default;
  virtual void disconnect() = 0;
  virtual void connect(size_t index, bool candidate) = 0;
  virtual bool saveCandidate() = 0;
  virtual bool startPortal() = 0;
  virtual void stopPortal() = 0;
  virtual void result(bool connected, bool saved) = 0;
};

// Every association is preceded by an observed disconnected state. A stale
// WL_CONNECTED from the previous network can never commit a candidate.
class Policy {
public:
  enum class State { Disconnecting, Connecting, Online, Waiting };
  void begin(uint32_t now, size_t count, Driver& driver) {
    count_ = count;
    index_ = 0;
    nextAttempt(now, driver);
  }
  bool submit(uint32_t now, Driver& driver) {
    if (!portal_ || candidate_ || elapsed(now, portalSince_, WindowMs - AttemptMs - 3000))
      return false;
    candidate_ = true;
    nextAttempt(now, driver);
    return true;
  }
  void tick(uint32_t now, bool connected, bool matches, Driver& driver) {
    if (portal_ && elapsed(now, portalSince_, WindowMs)) {
      driver.stopPortal();
      portal_ = false;
      cooldown_ = true;
      portalStopped_ = now;
    }
    switch (state_) {
      case State::Disconnecting:
        if (!connected && elapsed(now, since_, 100)) {
          driver.connect(index_, candidate_);
          state_ = State::Connecting;
          since_ = now;
        } else if (elapsed(now, since_, 2000)) {
          failed(now, driver);
        }
        break;
      case State::Connecting:
        if (connected && matches && elapsed(now, since_, 500)) {
          if (candidate_) {
            const bool saved = driver.saveCandidate();
            driver.result(true, saved);
            candidate_ = false;
          }
          state_ = State::Online;
          if (portal_) {
            driver.stopPortal();
            portal_ = false;
            cooldown_ = true;
            portalStopped_ = now;
          }
        } else if (elapsed(now, since_, AttemptMs)) {
          failed(now, driver);
        }
        break;
      case State::Online:
        if (!connected) {
          index_ = 0;
          nextAttempt(now, driver);
        }
        break;
      case State::Waiting:
        if (elapsed(now, since_, RetryMs)) {
          index_ = 0;
          nextAttempt(now, driver);
        }
        break;
    }
  }
  void setCount(size_t count) { count_ = count; }
  bool portal() const { return portal_; }
  bool pending() const { return candidate_; }
  bool online() const { return state_ == State::Online; }
  State state() const { return state_; }

private:
  void nextAttempt(uint32_t now, Driver& driver) {
    driver.disconnect();
    since_ = now;
    state_ = State::Disconnecting;
    if (!candidate_ && count_ == 0) exhausted(now, driver);
  }
  void exhausted(uint32_t now, Driver& driver) {
    if (!portal_ && (!cooldown_ || elapsed(now, portalStopped_, CooldownMs))) {
      // Failed AP startup also enters cooldown; never retry in a tight loop.
      if (driver.startPortal()) {
        portal_ = true;
        portalSince_ = now;
      } else {
        cooldown_ = true;
        portalStopped_ = now;
      }
    }
    state_ = State::Waiting;
    since_ = now;
  }
  void failed(uint32_t now, Driver& driver) {
    driver.disconnect();
    if (candidate_) {
      driver.result(false, false);
      candidate_ = false;
      index_ = 0;
      state_ = State::Waiting;
      since_ = now;
    } else if (++index_ < count_) {
      nextAttempt(now, driver);
    } else {
      exhausted(now, driver);
    }
  }
  State state_ = State::Waiting;
  size_t count_ = 0, index_ = 0;
  uint32_t since_ = 0, portalSince_ = 0, portalStopped_ = 0;
  bool candidate_ = false, portal_ = false, cooldown_ = false;
};
} // namespace provisioning
