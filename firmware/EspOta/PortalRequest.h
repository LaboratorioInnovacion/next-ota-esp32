#pragma once

#include "WiFiPolicy.h"
#include "StationLocation.h"
#include <stdlib.h>
#include <strings.h>

namespace provisioning {
constexpr size_t RequestLimit = 1536;
enum class Request { Incomplete, Form, Style, Script, Parser, Decoder, Captive, Submit, Reject };
constexpr char CaptiveRedirect[] = "HTTP/1.1 302 Found\r\nLocation: http://192.168.4.1/\r\n"
    "Cache-Control: no-store\r\nConnection: close\r\nContent-Length: 0\r\n\r\n";

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
inline Request parse(const char* data, size_t length, const char* token, Credential& credential,
                     Location* location = nullptr) {
  if (length > RequestLimit || memchr(data, 0, length)) return Request::Reject;
  const char* end = strstr(data, "\r\n\r\n");
  if (!end) return length >= 1024 ? Request::Reject : Request::Incomplete;
  const size_t headerSize = size_t(end - data) + 4;
  if (headerSize > 1024) return Request::Reject;
  for (size_t i = 0; i < headerSize; ++i) {
    const unsigned char c = static_cast<unsigned char>(data[i]);
    if ((c < 32 && c != '\r' && c != '\n' && c != '\t') || c == 127 ||
        (c == '\r' && (i + 1 == headerSize || data[i + 1] != '\n')) ||
        (c == '\n' && (!i || data[i - 1] != '\r'))) return Request::Reject;
  }
  const char* line = strstr(data, "\r\n");
  const size_t firstSize = size_t(line - data);
  Request route = Request::Reject;
  const auto matches = [&](const char* text) {
    return firstSize == strlen(text) && memcmp(data, text, firstSize) == 0;
  };
  const auto probe = [&](const char* path) {
    const size_t pathSize = strlen(path);
    return firstSize == pathSize + 13 && memcmp(data, "GET ", 4) == 0 &&
        memcmp(data + 4, path, pathSize) == 0 &&
        (memcmp(data + 4 + pathSize, " HTTP/1.1", 9) == 0 ||
         memcmp(data + 4 + pathSize, " HTTP/1.0", 9) == 0);
  };
  if (matches("GET / HTTP/1.1")) route = Request::Form;
  else if (matches("GET /setup.css HTTP/1.1")) route = Request::Style;
  else if (matches("GET /setup.js HTTP/1.1")) route = Request::Script;
  else if (matches("GET /wifi-qr.js HTTP/1.1")) route = Request::Parser;
  else if (matches("GET /qr-decoder.js HTTP/1.1")) route = Request::Decoder;
  else if (probe("/generate_204") || probe("/gen_204") || probe("/hotspot-detect.html") ||
           probe("/connecttest.txt") || probe("/ncsi.txt")) route = Request::Captive;
  const bool get = route != Request::Reject;
  const bool post = firstSize == 19 && memcmp(data, "POST /save HTTP/1.1", 19) == 0;
  if (!get && !post) return Request::Reject;
  bool host = false, origin = false, type = false, sizeSeen = false;
  size_t bodySize = 0;
  line += 2;
  while (line < end) {
    const char* next = strstr(line, "\r\n");
    const char* colon = static_cast<const char*>(memchr(line, ':', size_t(next - line)));
    if (!colon || colon == line) return Request::Reject;
    for (const char* p = line; p < colon; ++p)
      if (!((*p >= 'a' && *p <= 'z') || (*p >= 'A' && *p <= 'Z') ||
            (*p >= '0' && *p <= '9') || *p == '-')) return Request::Reject;
    const char* value = colon + 1;
    while (value < next && *value == ' ') ++value;
    const size_t keySize = size_t(colon - line), valueSize = size_t(next - value);
    if (keySize == 4 && strncasecmp(line, "Host", 4) == 0) {
      const bool local = (valueSize == 11 && memcmp(value, "192.168.4.1", 11) == 0) ||
                         (valueSize == 14 && memcmp(value, "192.168.4.1:80", 14) == 0);
      if (host || !valueSize || valueSize > 253) return Request::Reject;
      for (const char* p = value; p < next; ++p)
        if (!( (*p >= 'a' && *p <= 'z') || (*p >= 'A' && *p <= 'Z') ||
               (*p >= '0' && *p <= '9') || *p == '.' || *p == '-' || *p == ':')) return Request::Reject;
      // Foreign hosts can receive only a fixed redirect, never assets or tokens.
      if (!local) {
        if (!get || (route != Request::Captive && route != Request::Form)) return Request::Reject;
        route = Request::Captive;
      }
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
  if (get) return route;
  char ssid[33] = {}, password[64] = {}, receivedToken[33] = {};
  char latitude[25] = {}, longitude[25] = {};
  bool latitudeSeen = false, longitudeSeen = false;
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
    } else if (equal - field == 8 && memcmp(field, "latitude", 8) == 0 && !latitudeSeen) {
      target = latitude; capacity = sizeof(latitude); latitudeSeen = true;
    } else if (equal - field == 9 && memcmp(field, "longitude", 9) == 0 && !longitudeSeen) {
      target = longitude; capacity = sizeof(longitude); longitudeSeen = true;
    } else return Request::Reject;
    if (!decode(equal + 1, size_t(amp - equal - 1), target, capacity)) return Request::Reject;
    field = amp + 1;
  }
  if (!ssidSeen || !passwordSeen || !tokenSeen || strcmp(token, receivedToken)) return Request::Reject;
  Location parsedLocation;
  if (!parseLocation(latitude, longitude, parsedLocation)) return Request::Reject;
  if (location) *location = parsedLocation;
  return assign(credential, ssid, strlen(ssid), password, strlen(password)) ? Request::Submit : Request::Reject;
}
} // namespace provisioning
