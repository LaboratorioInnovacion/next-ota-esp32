#pragma once
#include <stddef.h>

namespace provisioning {
// Non-owning flash/header/token slices: never copy the decoder into heap RAM.
class ResponseStream {
public:
  void begin(const char* header, size_t headerSize, const char* body, size_t bodySize,
             const char* token, size_t tokenSize, const char* tail, size_t tailSize) {
    parts_[0] = header; lengths_[0] = headerSize;
    parts_[1] = body; lengths_[1] = bodySize;
    parts_[2] = token; lengths_[2] = tokenSize;
    parts_[3] = tail; lengths_[3] = tailSize;
    part_ = offset_ = 0;
    skipEmpty();
  }
  void clear() { part_ = 4; offset_ = 0; }
  bool active() const { return part_ < 4; }
  const char* data() const { return active() ? parts_[part_] + offset_ : nullptr; }
  size_t size() const {
    const size_t remaining = active() ? lengths_[part_] - offset_ : 0;
    return remaining > 512 ? 512 : remaining;
  }
  bool advance(size_t sent) {
    if (sent > size()) return false;
    offset_ += sent;
    skipEmpty();
    return true;
  }
private:
  void skipEmpty() {
    while (part_ < 4 && offset_ == lengths_[part_]) { ++part_; offset_ = 0; }
  }
  const char* parts_[4]{};
  size_t lengths_[4]{};
  size_t part_ = 4, offset_ = 0;
};
}
