// Copy to ignored DiagnosticsLocal.h. Never use the setup AP password here.
// Supply a dedicated high-entropy token through your private build configuration.
#define ESP32_DIAGNOSTICS_TOKEN ""
// Supply independently verified trusted root PEM(s) for BOTH destination hosts.
#define ESP32_DIAGNOSTICS_ROOT_CA ""
// Remain disabled until the actual core/TLS validation and clock are verified.
#define ESP32_DIAGNOSTICS_TLS_APPROVED 0
