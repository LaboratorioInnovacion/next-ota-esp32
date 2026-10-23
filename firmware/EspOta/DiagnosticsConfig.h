#ifndef DIAGNOSTICS_CONFIG_H
#define DIAGNOSTICS_CONFIG_H

#if defined(__has_include)
#if __has_include("DiagnosticsLocal.h")
#include "DiagnosticsLocal.h"
#endif
#endif

#ifndef ESP32_DIAGNOSTICS_TOKEN
#define ESP32_DIAGNOSTICS_TOKEN ""
#endif
#ifndef ESP32_DIAGNOSTICS_ROOT_CA
#define ESP32_DIAGNOSTICS_ROOT_CA ""
#endif
// Opt in only after checking the core, trust roots and clock source on hardware.
#ifndef ESP32_DIAGNOSTICS_TLS_APPROVED
#define ESP32_DIAGNOSTICS_TLS_APPROVED 0
#endif

#endif
