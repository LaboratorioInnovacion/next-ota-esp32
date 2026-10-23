#pragma once

namespace provisioning {
// TEST ONLY: shared across devices. Change before deployment.
// Set to "" to restore the persisted random-per-device password fallback.
constexpr char TemporarySharedSetupPassword[] = "Nodotecnologico1*";
} // namespace provisioning
