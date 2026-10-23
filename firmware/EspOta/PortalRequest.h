#pragma once

#include "WiFiPolicy.h"
#include <stdlib.h>
#include <strings.h>

namespace provisioning {
constexpr size_t RequestLimit = 1536;
enum class Request { Incomplete, Form, Submit, Reject };

inline int hex(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

inline bool decode(const char* first, size_t length, char* out, size_t capacity) {
  size_t n = 0;
  for (size_t i = 0; i < length; ++i) {
    char c = first[i];
    if (c == '%') {
      if (i + 2 >= length || hex(first[i + 1]) < 0 || hex(first[i + 2]) < 0) return false;
      c = char(hex(first[i + 1]) * 16 + hex(first[i + 2]));
      i += 2;
    } else if (c == '+') c = ' ';
    if (!c || n + 1 >= capacity) return false;
    out[n++] = c;
  }
  out[n] = 0;
  return true;
}

// Fixed-size HTTP parser: reject chunking, duplicate security headers,
// oversized headers/bodies, foreign Host/Origin, and unexpected form fields.
// No credential is ever included in a response.
inline Request parse(const char* data, size_t length, const char* token, Credential& credential) {
  if (length > RequestLimit || memchr(data, 0, length)) return Request::Reject;
  const char* end = strstr(data, "\r\n\r\n");
  if (!end) return length >= 1024 ? Request::Reject : Request::Incomplete;
  const size_t headerSize = size_t(end - data) + 4;
  if (headerSize > 1024) return Request::Reject;
  const char* line = strstr(data, "\r\n");
  const size_t firstSize = size_t(line - data);
  const bool get = firstSize == 14 && memcmp(data, "GET / HTTP/1.1", 14) == 0;
  const bool post = firstSize == 19 && memcmp(data, "POST /save HTTP/1.1", 19) == 0;
  if (!get && !post) return Request::Reject;
  bool host = false, origin = false, type = false, sizeSeen = false;
  size_t bodySize = 0;
  line += 2;
  while (line < end) {
    const char* next = strstr(line, "\r\n");
    const char* colon = static_cast<const char*>(memchr(line, ':', size_t(next - line)));
    if (!colon || colon == line) return Request::Reject;
    const char* value = colon + 1;
    while (value < next && *value == ' ') ++value;
    const size_t keySize = size_t(colon - line), valueSize = size_t(next - value);
    if (keySize == 4 && strncasecmp(line, "Host", 4) == 0) {
      if (host || !((valueSize == 11 && memcmp(value, "192.168.4.1", 11) == 0) ||
                    (valueSize == 14 && memcmp(value, "192.168.4.1:80", 14) == 0))) return Request::Reject;
      host = true;
    } else if (keySize == 6 && strncasecmp(line, "Origin", 6) == 0) {
      if (origin || !((valueSize == 18 && memcmp(value, "http://192.168.4.1", 18) == 0) ||
                      (valueSize == 21 && memcmp(value, "http://192.168.4.1:80", 21) == 0))) return Request::Reject;
      origin = true;
    } else if (keySize == 12 && strncasecmp(line, "Content-Type", 12) == 0) {
      const char expected[] = "application/x-www-form-urlencoded";
      if (type || valueSize != sizeof(expected) - 1 || memcmp(value, expected, valueSize)) return Request::Reject;
      type = true;
    } else if (keySize == 14 && strncasecmp(line, "Content-Length", 14) == 0) {
      if (sizeSeen || !valueSize || valueSize > 3) return Request::Reject;
      for (const char* p = value; p < next; ++p) {
        if (*p < '0' || *p > '9') return Request::Reject;
        bodySize = bodySize * 10 + size_t(*p - '0');
      }
      if (bodySize > 512) return Request::Reject;
      sizeSeen = true;
    } else if (keySize == 17 && strncasecmp(line, "Transfer-Encoding", 17) == 0) {
      return Request::Reject;
    }
    line = next + 2;
  }
  if (!host || (get && bodySize) || (post && (!sizeSeen || !type))) return Request::Reject;
  if (length < headerSize + bodySize) return Request::Incomplete;
  if (length != headerSize + bodySize) return Request::Reject;
  if (get) return Request::Form;
  char ssid[33] = {}, password[64] = {}, receivedToken[33] = {};
  bool ssidSeen = false, passwordSeen = false, tokenSeen = false;
  const char* field = data + headerSize;
  const char* finish = field + bodySize;
  while (field < finish) {
    const char* amp = static_cast<const char*>(memchr(field, '&', size_t(finish - field)));
    if (!amp) amp = finish;
    const char* equal = static_cast<const char*>(memchr(field, '=', size_t(amp - field)));
    if (!equal) return Request::Reject;
    char* target = nullptr;
    size_t capacity = 0;
    if (equal - field == 4 && memcmp(field, "ssid", 4) == 0 && !ssidSeen) {
      target = ssid; capacity = sizeof(ssid); ssidSeen = true;
    } else if (equal - field == 8 && memcmp(field, "password", 8) == 0 && !passwordSeen) {
      target = password; capacity = sizeof(password); passwordSeen = true;
    } else if (equal - field == 5 && memcmp(field, "token", 5) == 0 && !tokenSeen) {
      target = receivedToken; capacity = sizeof(receivedToken); tokenSeen = true;
    } else return Request::Reject;
    if (!decode(equal + 1, size_t(amp - equal - 1), target, capacity)) return Request::Reject;
    field = amp + 1;
  }
  if (!ssidSeen || !passwordSeen || !tokenSeen || strcmp(token, receivedToken)) return Request::Reject;
  return assign(credential, ssid, strlen(ssid), password, strlen(password)) ? Request::Submit : Request::Reject;
}
} // namespace provisioning
