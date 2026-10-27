#pragma once
#include <stddef.h>
#include <stdint.h>
#include <string.h>

namespace provisioning {
constexpr size_t StationNameLimit = 64; // UTF-8 bytes, not characters; never truncate.
struct StationName { char text[StationNameLimit + 1]{}; };
inline bool nameSpace(unsigned char c) { return c == ' ' || (c >= 9 && c <= 13); }
inline bool parseStationName(const char* text, StationName& out) {
  const char* end = text + strlen(text);
  while (text < end && nameSpace(*text)) ++text;
  while (end > text && nameSpace(end[-1])) --end;
  const size_t length = size_t(end - text);
  if (length > StationNameLimit) return false;
  // Reject malformed/overlong UTF-8, surrogates, and C0/C1 controls.
  for (size_t i = 0; i < length;) {
    const unsigned char c = text[i++];
    uint32_t cp = c;
    size_t count = 0;
    if (c >= 0xc2 && c <= 0xdf) { cp = c & 31; count = 1; }
    else if (c >= 0xe0 && c <= 0xef) { cp = c & 15; count = 2; }
    else if (c >= 0xf0 && c <= 0xf4) { cp = c & 7; count = 3; }
    else if (c >= 0x80) return false;
    if (i + count > length) return false;
    for (size_t n = 0; n < count; ++n) {
      const unsigned char next = text[i++];
      if ((next & 0xc0) != 0x80) return false;
      cp = (cp << 6) | (next & 63);
    }
    if ((count == 1 && cp < 0x80) || (count == 2 && cp < 0x800) ||
        (count == 3 && cp < 0x10000) || cp > 0x10ffff ||
        (cp >= 0xd800 && cp <= 0xdfff) || cp < 32 || (cp >= 127 && cp <= 159)) return false;
  }
  out = StationName{};
  memcpy(out.text, text, length);
  return true;
}
// Preferences-compatible adapter; only station-meta/stationName is touched.
class StationNameOverride {
public:
  template<class Preferences> void load(Preferences& storage) {
    value_ = StationName{};
    StationName stored{}, parsed{};
    if (storage.getBytesLength("stationName") == sizeof(stored) &&
        storage.getBytes("stationName", &stored, sizeof(stored)) == sizeof(stored) &&
        memchr(stored.text, 0, sizeof(stored.text)) && parseStationName(stored.text, parsed)) value_ = parsed;
  }
  template<class Preferences> bool commit(Preferences& storage, const StationName& next) {
    StationName validated{};
    if (!memchr(next.text, 0, sizeof(next.text)) || !parseStationName(next.text, validated) ||
        strcmp(validated.text, next.text)) return false;
    const StationName previous = value_;
    if (!write(storage, next)) {
      write(storage, previous); // Best effort: failed NVS writes cannot guarantee rollback.
      return false;
    }
    value_ = next;
    return true;
  }
  const char* saved() const { return value_.text; }
  const char* effective(const char* firmware) const { return *value_.text ? value_.text : firmware; }
private:
  template<class Preferences> bool write(Preferences& storage, const StationName& next) {
    if (!*next.text) return !storage.isKey("stationName") ||
        (storage.remove("stationName") && !storage.isKey("stationName"));
    StationName readback{};
    return storage.putBytes("stationName", &next, sizeof(next)) == sizeof(next) &&
        storage.getBytes("stationName", &readback, sizeof(readback)) == sizeof(readback) &&
        !memcmp(&next, &readback, sizeof(next));
  }
  StationName value_;
};
// Shared with the native-to-Next contract fixture. UTF-8 bytes remain intact.
template<class Text> Text jsonString(const char* value) {
  Text result;
  const char hex[] = "0123456789abcdef";
  for (const unsigned char* p = reinterpret_cast<const unsigned char*>(value); *p; ++p) {
    if (*p == '"' || *p == '\\') { result += '\\'; result += char(*p); }
    else if (*p < 32) {
      result += "\\u00"; result += hex[*p >> 4]; result += hex[*p & 15];
    } else result += char(*p);
  }
  return result;
}
template<class Text> Text htmlAttribute(const char* value) {
  Text result;
  for (; *value; ++value) {
    switch (*value) {
      case '&': result += "&amp;"; break;
      case '"': result += "&quot;"; break;
      case '<': result += "&lt;"; break;
      case '>': result += "&gt;"; break;
      case '\'': result += "&#39;"; break;
      default: result += *value;
    }
  }
  return result;
}
} // namespace provisioning
