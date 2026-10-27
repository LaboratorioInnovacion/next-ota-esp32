#include "../StationIdentity.h"
#include "../StationLocation.h"
#include <assert.h>
#include <iostream>
#include <string>

int main() {
  station::Identity identity;
  const char* hardware = "02:00:00:00:00:01";
  assert(!strcmp(identity.resolve(hardware), hardware));
  for (const char* valid : {"02:00:00:00:00:02", "aA:bB:cC:dD:eE:fF"}) {
    assert(identity.configure(valid));
    assert(!strcmp(identity.resolve(hardware), valid));
  }
  assert(identity.configure(""));
  assert(!strcmp(identity.resolve(hardware), hardware));
  for (const char* invalid : {"x", "AA-BB-CC-DD-EE-FF", "AA:BB:CC:DD:EE:FG",
      " AA:BB:CC:DD:EE:FF", "AA:BB:CC:DD:EE:FF ", "A:B:C:D:E:F", "AA:BB:CC:DD:EE:FF:00"}) {
    assert(identity.configure("02:00:00:00:00:02"));
    assert(!identity.configure(invalid));
    assert(!strcmp(identity.resolve(hardware), hardware));
  }
  assert(!identity.configure(nullptr));
  assert(!strcmp(identity.resolve(hardware), hardware));
  static_assert(provisioning::validCoordinates(0, 0), "Zero is valid");
  static_assert(provisioning::validCoordinates(-90, 180), "Bounds are valid");
  static_assert(!provisioning::validCoordinates(91, 0), "Latitude must be bounded");
  for (float bad : {NAN, INFINITY, -INFINITY, 181.0f}) {
    assert(!provisioning::effectiveLocation(bad, 0, provisioning::Location{}).present);
    assert(!provisioning::effectiveLocation(0, bad, provisioning::Location{}).present);
  }
  std::cout << "2 station identity and default-coordinate test groups passed\n";
}
