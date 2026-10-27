// Host boundary fixture: production identity/location policies, no Arduino HTTP adapter.
#include "../StationIdentity.h"
#include "../StationLocation.h"
#include "../StationName.h"
#include <assert.h>
#include <iostream>
#include <iomanip>

int main() {
  station::Identity identity;
  provisioning::Location portal;
  provisioning::StationName name;
  const char* firmwareName = "Synthetic station";
  auto emit = [&]() {
    const auto location = provisioning::effectiveLocation(12.5f, -45.25f, portal);
    assert(location.present);
    std::cout << std::fixed << std::setprecision(6)
        << "{\"mac\":\"" << identity.resolve("02:00:00:00:00:01")
        << "\",\"name\":\"" << provisioning::jsonString<std::string>(*name.text ? name.text : firmwareName)
        << "\",\"version\":\"test-only\","
        << "\"temperature\":20.0,\"humidity\":50.0,\"lat\":" << location.latitude
        << ",\"lon\":" << location.longitude << "}\n";
  };
  emit();
  assert(identity.configure("02:00:00:00:00:02"));
  assert(provisioning::parseLocation("0", "0", portal));
  assert(provisioning::parseStationName(" Estación \"Norte\" \\ patio ", name));
  emit();
  assert(provisioning::parseLocation("", "", portal));
  assert(provisioning::parseStationName("", name));
  emit();
  assert(!identity.configure("invalid"));
  emit();
}
