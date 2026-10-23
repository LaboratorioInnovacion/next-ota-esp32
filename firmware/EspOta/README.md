# Connect a station from your phone

This sketch retries known WiFi networks without rebooting. If none connects, it
opens a **password-protected, temporary local setup AP**. Optional compiled
networks, sensor pin, and MQTT OTA protocol remain unchanged. Setup also accepts
an optional persistent latitude/longitude pair.

## Phone setup

1. Use the supplied temporary setup password. **TEST ONLY:**
   `TemporarySharedSetupPassword` in `SetupConfig.h` configures the same password
   across devices. Change it before deployment. This override takes precedence
   over any old random `setup-pass` in NVS without changing stored credentials.
2. After known networks fail (or immediately when none are configured), join
   **`estacionm-nodo-xxxx`** on your phone with
   that password. Choose to stay connected even though there is no Internet.
3. Your phone may open a sign-in/setup window automatically. If not, open
   **`http://192.168.4.1`** explicitly (not HTTPS). Enter the exact SSID and
   WPA password of a **2.4 GHz** router or phone hotspot, or select a photo of
   its **WiFi QR** to fill both fields. Optionally enter **both latitude and longitude**
   in decimal degrees, with a decimal point. Review/edit the values and submit once.
   No app, Internet service, or GPS permission is needed.
4. Wait about 15 seconds. Successful association closes setup; wrong credentials
   leave it available for retry. **Serial confirms whether saving succeeded.**
   AP disappearance alone does not prove persistence if storage failed.

A hotspot must be switched on and visible during the test. A second phone or
computer may be needed to run the hotspot while browsing setup: some phones
cannot remain a hotspot and join another AP simultaneously. No scan/list is
provided; manual SSID/password inputs always remain available. No GPIO/button is assumed.

### Captive sign-in behavior

While setup is active, a small wildcard DNS responder answers plain A queries with
`192.168.4.1`; AAAA receives an empty answer. Android `/generate_204`/`/gen_204`,
Apple `/hotspot-detect.html`, Windows `/connecttest.txt`/`/ncsi.txt`, and foreign-host
root GETs receive a fixed HTTP 302 to `http://192.168.4.1/`. This intentionally does
not return the OS's Internet-success response. No HTTPS is intercepted or spoofed.
OS versions, private DNS, cached probes and browser policies can prevent a popup.
Stay on the no-Internet ESP WiFi and use the manual HTTP URL when needed.

DNS and HTTP sockets bind to the AP device **and** the fixed AP address, not the
STA interface. Binding failure disables that service; HTTP binding failure closes
setup and enters cooldown. DNS failure leaves manual HTTP setup available. The
core must expose working lwIP `SO_BINDTODEVICE` and ESP-NETIF APIs. Source APIs
were checked against IDF 4.4.7/5.1.4, but the installed user core is unknown; an
ESP32 compile and AP+STA isolation test are still required. The built-in DNS server
was not used because verified implementations listen on all interfaces.

One bounded DNS packet is serviced per loop, without upstream resolution; only
single-question plain IN A/AAAA queries from AP-subnet peers are handled. Compressed,
malformed, oversized (>288 bytes), multi-question and additional-record/EDNS packets
are dropped. Responses add at most 16 bytes. Both services close when setup closes,
including cooldown. HTTP captive exceptions never expose assets/tokens to foreign
hosts and never redirect POSTs or relax POST Host/Origin/CSRF validation.

### Location persistence

- Latitude is finite **−90 to 90**, longitude **−180 to 180**. Enter both or leave
  both blank; partial pairs, commas, exponent/hex syntax and nonfinite values are
  rejected. **`0, 0` is valid** (enter `0` in each field), not an unset sentinel.
- Blank fields retain the previous verified location, or the sketch's existing
  `setLocation` fallback if none is stored. Placeholders are never saved. QR reading
  changes only WiFi inputs, never the location, and never submits automatically.
- Only explicit submission followed by fresh WiFi association **and confirmed WiFi
  storage** can save a supplied location. A failed connection never saves it. A
  network-storage failure skips the location write. Location-storage failure can
  leave the WiFi entry saved: the serial result does not claim complete success.
- The owned coordinate pair is a small versioned, checksummed Preferences blob in
  **`station-meta` / `location`**, separate from `station-wifi`. Write length and
  exact readback must match before the active coordinates change. Failure retains
  the active prior location and attempts to restore a known previous blob. If
  verification/rollback itself fails, the durable outcome is uncertain; a later
  reboot may load the last valid stored blob. There is no cross-namespace transaction.
- Boot loads saved coordinates after the sketch default; successful setup updates
  the same existing weather JSON `lat`/`lon` fields. No observation time is invented.
  Normal reboot/power loss retains both WiFi and location.

**Dashboard limitation:** `my-app/app/api/esp32/route.js` currently forwards only
`mac`, `name`, `temperature`, and `humidity` to ingestion. It ignores incoming
coordinates. A separate backend change is required for this location to update
the dashboard/map; no backend files are changed here.

### Every-flash WiFi reset (including the identical binary)

**The sketch cannot detect an identical-binary reflash.** It deliberately does not
erase NVS at boot, on a build fingerprint, or during normal reboot/power cycling.
Configure the **uploader** to erase before **each wired sketch upload** if every
flash must forget WiFi:

1. Verify the installed **Espressif Arduino-ESP32 core version and selected board**
   in Arduino IDE. WROOM-32 describes the module, not a verified board/FQBN or core.
2. In versions/boards exposing the documented menu, select **Tools → Erase All Flash
   Before Sketch Upload → Enabled** before uploading the correct sketch. Check the
   upload log confirms erasure each time, even when uploading the same binary.
   The official latest guide documents this exact label; availability on the user's
   unspecified installed version/board has **not** been verified. If absent, obtain
   that core/board's documented erase/upload workflow first; do not guess offsets,
   partition schemes, board settings or erase commands.
3. This is **full-flash erasure**, not WiFi-only: saved networks, location, random
   setup credentials and other NVS data are lost. The uploaded firmware starts
   with its compiled defaults and opens setup when no network is available.
   The configured shared compile-time setup password is unchanged by NVS erasure.
4. A normal upload **without erase** retains WiFi/location by design. OTA is not
   covered by the wired uploader menu. Do not use full erasure as an OTA instruction.

WiFi-only reset while preserving location would require a separately authorized
service/uploader operation scoped to `station-wifi`; it is not implemented here.
No erase, upload, flash, or device operation was executed for this change.

Official references: [Arduino-ESP32 Tools menu](https://docs.espressif.com/projects/arduino-esp32/en/latest/guides/tools_menu.html#erase-all-flash-before-sketch-upload),
[Preferences byte API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/preferences.html),
[IDF 4.4.7 ESP-NETIF declarations](https://github.com/espressif/esp-idf/blob/v4.4.7/components/esp_netif/include/esp_netif.h),
[ESP lwIP device binding](https://github.com/espressif/esp-lwip/blob/2.1.3-esp/src/api/sockets.c).

### Photo QR, not a live scanner

The local page uses neutral Spanish, a mobile-first layout and accessible labels,
focus indicators, masked password/reveal control, status messages and busy feedback.
Manual entry and the protected POST form also work with JavaScript disabled.
The SSID suffix is the last two bytes of the public station MAC, lowercase hex;
it is stable, not globally unique, and unrelated to the unchanged setup password.

- Take a photo or choose an image using the phone's file picker (choices depend
  on the browser). Local HTTP cannot reliably use secure-context live-camera
  APIs; no `getUserMedia` permissions or native `BarcodeDetector` are required.
- Offline jsQR decodes on the phone, including browsers without BarcodeDetector.
  Images never upload to ESP32/cloud. QR parsing only fills editable fields;
  nothing is submitted until the user confirms the existing form POST.
- Use one standard `WIFI:` QR with `T:WPA` or personal `T:WPA2`, SSID and passphrase.
  Backslash-escaped backslashes, semicolons, colons and commas are supported.
  Duplicate/unknown fields, invalid escapes, Enterprise, WEP, open networks,
  raw 64-digit PSKs and arbitrary URLs are rejected without echoing their data.
  Explicit `T:WPA3` is rejected because the selected Arduino core/security mode
  has not been established; `T:WPA` is not a promise of WPA3 compatibility.
- JPEG/PNG only, up to 8 MiB and 24 megapixels with each original side <=8192;
  inspect dimensions before browser decoding and resize both sides to <=1024.
  Decode at most twice, masking the first QR to reject a second detected QR.
  Detection is not exhaustive: crop tightly to a single WiFi QR. Unreadable,
  unsupported or oversized photos leave manual inputs untouched.

### Offline asset maintenance and size

Review `portal/` sources, not the generated `PortalAssets.h`. Regenerate with
`python3 firmware/EspOta/portal/generate-assets.py` from the repository root.
The generated PROGMEM arrays are sent as non-owning slices: at most 512 bytes
per loop using a nonblocking socket send, with a 15-second response deadline.
The single-client parser still limits headers to 1024 and POST bodies to 512 bytes;
the body limit includes percent-encoded WiFi, token and coordinate fields, not
just decoded characters. Over-limit requests are rejected without changes; it is
not expanded to accept arbitrary over-encoding.
Assets use AP-interface, exact local Host and Origin checks; only captive GETs
receive the limited redirect exception described above. CSP permits only
same-origin scripts/styles, not inline scripts, external services or connections.

`portal/vendor/jsQR.min.js` is jsQR **1.4.0**, Apache-2.0; its full license and
exact npm source/integrity/minified checksum are in `portal/vendor/`.
`portal/vendor-source.py` reproduces vendoring from official npm HTTPS bytes,
verifies npm SHA-512/SHA-1, and uses the already installed Terser 5.46.1; it does
not install or execute package scripts. The minified decoder is **130,267 bytes**
before other assets. Source assets duplicated in the generated header are not
separate firmware copies: only included PROGMEM arrays enter the binary.
Flash/OTA slot fit is **unverified** until the actual FQBN, core and partition
layout are supplied and a binary is built. Do not flash this candidate based on
the source size alone.

Run `bash firmware/EspOta/tests/run-host-tests.sh` and
`node --test firmware/EspOta/tests/portal.test.cjs`. QR fixtures contain only
public synthetic test values; regenerate them with `tests/generate-qr-fixtures.cjs`
using the existing OS `qrcode-terminal` generator (no install). Node tests execute
the production parser, actual vendored decoder and a mocked-DOM interaction harness;
they are not real browser/phone or hardware validation. Those checks remain pending.

## Timing and persistence

| Behavior | Default |
| --- | --- |
| Network order | Up to five saved entries, then up to five owned compiled entries (currently none) |
| Attempt | Disconnected-state barrier (up to 2 s), then association up to 10 s |
| Failed full cycle | Retry after 30 s, no automatic reboot |
| Setup availability | 10 minutes, then at least 5 minutes closed; opens again after a failed cycle |
| Runtime WiFi loss | Same network cycle and protected recovery as startup |
| Upstream failure only | MQTT/HTTP failure never triggers setup |
| Input | SSID 1–32 bytes, WPA passphrase 8–63 printable ASCII bytes; no open networks/raw 64-digit PSKs |
| Save | Only after fresh association to the submitted SSID, never on form acceptance |

Saved entries use append-only Preferences/NVS slots in `station-wifi`. Existing
entries are not replaced or erased on a failed write or failed connection.
Identical entries do not consume another slot; a changed password consumes a new
slot. When full, new entries are rejected. There is deliberately no erase/reset
endpoint; slot maintenance requires an explicitly authorized USB/service workflow.
Corrupt occupied slots are reserved, not silently overwritten. NVS write and
readback failures are reported on serial; an unconfirmed save might be recovered
after reboot if only readback failed. A connection without persistence can work
until reboot, while old saved/compiled fallbacks remain intact.

New submissions are refused during the last 13 seconds of a setup window. Setup
does not close because a stale/previous association is still reported: every new
attempt first observes disconnection. A pending submitted attempt owns the
connection test until success or timeout; known-network retries cannot interrupt it.
Association proves local network access, not Internet access or backend reachability.

## Security boundary

- Setup never falls back to an open AP. Storage/password/AP startup failures
  disable setup and enter cooldown while compiled-network recovery continues.
- The current shared test password is not printed on serial or shown on the page.
  To restore random-per-device mode, set `TemporarySharedSetupPassword` to `""`.
  Only in that fallback mode, retrieve the persisted random password from the
  physical serial console at **115200 baud** when setup opens and record it
  privately if later users lack serial access. Do not forward that serial output
  upstream or share screenshots; there is no Internet/account-based recovery.
  A nonempty invalid override (not 8–63 printable ASCII bytes) disables setup;
  it never falls back to an old password or an open AP.
- HTTP listens only while setup is active. STA-interface sockets are rejected
  by device/address binding and a local-IP guard before parsing. Use a target LAN
  subnet different from `192.168.4.0/24` to avoid routing conflicts.
- The local page shows no saved credentials. Submission uses POST, a random
  per-window token, exact local Host validation, and foreign-Origin rejection.
  Request memory is bounded (1536 bytes; headers 1024, body 512), single-client,
  with a 2-second receive deadline. Credentials are never echoed in responses.
- Local HTTP relies on the protected WPA link, not TLS. Anyone holding the setup
  password, controlling the connected phone, or accessing serial/flash is trusted
  to configure a network. Shared passwords, nearby radio denial of service,
  hostile AP clients, and a compromised browser/device remain risks. This is not
  a hardened Internet-facing web server. No NVS encryption or secure-boot claim
  is made: stored credentials remain accessible to physical flash access.
- The pre-existing upstream `setInsecure()` TLS behavior remains a separate risk;
  this change does not authenticate the broker or redesign OTA authorization.

## Sensor, HTTP, and OTA behavior

The main loop services networking frequently; DHT11/GPIO15 reads are scheduled
every 10 seconds without the former 10-second sleep. Weather data is sent to both
active destinations, in this order:

1. `https://miniestaciones.vercel.app/api/esp32` (original, recovered from this sketch's Git HEAD).
2. `https://estaciones.modernshop.com.ar/api/esp32` (new; not yet online).

Both weather POSTs attach `Authorization: Bearer <configured setup password>`,
using `provisioning::TemporarySharedSetupPassword` from `SetupConfig.h` with the
same validation as setup. Empty (random-per-device mode) or invalid configuration
omits the header; the persisted random AP password is never sent. No additional
secret configuration is needed, and neither the header nor credential is logged.
The diagnostic token and its CA-verified client remain separate and unchanged.
This is a preparatory header only: the current backend handler ignores it, so
authentication is not enforced until backend validation is implemented. The
legacy weather HTTPS path described below does not verify the server, leaving
this shared setup credential exposed to interception by an impersonated server.

Each destination first becomes due **5 minutes after setup initializes delivery**,
then 5 minutes after its own successful send completes. Only 2xx is success.
Failures retry at least 60 seconds after that destination's previous attempt
starts; they never advance its success timer or resend a successful destination
early. An offline new endpoint does not suppress original-endpoint delivery.
Both due destinations receive the same sample snapshot and unchanged payload
fields/location. Retries use the latest valid scheduled reading, not a historical
queue; invalid current readings and unavailable WiFi/setup suspend sending.
Timers use unsigned subtraction across `millis()` rollover.

MQTT connection attempts are single attempts spaced at least 30 seconds apart
while WiFi is ready; subscriptions, heartbeat, OTA callback and update transport
remain. Synchronous MQTT/HTTP/OTA work is suspended during setup. TCP connection,
TLS handshake and MQTT response timeouts are configured at 5 seconds per phase;
HTTP connect/read timeouts are 5 seconds. These are **not total-operation
deadlines**: DNS uses core resolver limits, data streams may continue, and OTA
download/write and HTTP POST remain synchronous. No asynchronous OTA guarantee
is made. Existing OTA partition requirements still apply.

The original endpoint is attempted first, but delivery is **not asynchronous**:
a failed new endpoint can still delay the loop and a later original send by its
synchronous timeout phases. The existing `HTTPClient.begin(url)` convenience
overload supplies no CA; Arduino-ESP32 2.0.17/3.3.4 uses insecure HTTPS transport
on this path. HTTPS server authentication remains missing, and the actual core
is unknown. No new `setInsecure()` or TLS redesign is introduced. A future TLS
fix needs the selected core, trust roots and clock validation; URLs were not probed.

## Verification before any authorized device update

Run the deterministic host suite (C++11, ASan/UBSan; no ESP32 dependencies):

```sh
bash firmware/EspOta/tests/run-host-tests.sh
git diff --check
```

It exercises the production pure policy, credential storage and HTTP parser:
retry ordering/backoff, runtime loss, rollover, stale-connection rejection,
candidate commit conditions, failed saves/full storage, protected AP lifecycle,
fixed-password precedence/validation, CSRF/header/input limits and deterministic
malformed requests. It also exercises the production delivery scheduler: both
5-minute timers, independent failure retries, sample snapshots, network gating,
completion-based timing and rollover. It does **not**
compile Arduino adapters or simulate a radio/NVS power interruption.

No validated ESP32 binary is provided: the environment has no `arduino-cli`,
`pio` or `platformio`. Before building, supply the exact board/FQBN, Arduino-ESP32
core and library versions (PubSubClient/DHT), flash size and OTA-capable partition
layout. API references were checked against official Arduino-ESP32 documentation
and the 2.0.17/3.3.2 secure-client headers; actual installed compatibility is unknown.

- [ ] Compile for the actual board/core/partition scheme; check binary size/OTA slots.
- [ ] Bench startup offline and runtime router loss; verify no reboot loop.
- [ ] Verify protected AP/password stability after reboot, timeout and cooldown.
- [ ] Test phone/hotspot setup, wrong password, full/failing NVS, and power loss
      around save; verify old credentials remain usable.
- [ ] Reject STA-side and foreign-origin requests; confirm no credential upstream
      or in browser responses and measure setup responsiveness during AP+STA changes.
- [ ] Verify both 5-minute destinations, independent retries and MQTT recovery on authorized test services.
- [ ] Check OTA partition/transport compatibility only in a separately authorized
      maintenance window. Do not send OTA commands merely to validate this patch.

Rollback boundary: revert only this sketch's three existing file edits and remove
the added provisioning headers/source, tests and this README. This does not erase
NVS; previously saved provisioning data stays on the device but old firmware
ignores it. Other firmware sketches and the application are outside this change.

Delivery-only rollback: remove `WeatherDelivery.h` and its test, undo its sketch
wiring and the corresponding runner/docs edits; preserve all WiFi/setup changes.

Weather-header-only rollback: remove the setup/policy includes and conditional
Authorization header from `Esp32OTA.cpp`, plus the header documentation above;
preserve the setup configuration, delivery scheduler and diagnostic transport.

Portal-UX/QR-only rollback: restore `WiFiProvisioning.cpp/.h`, `PortalRequest.h`,
the portal runner entry and these portal docs to their pre-change versions;
remove `PortalAssets.h`, `PortalIdentity.h`, `PortalStream.h`, `portal/`, and the
new portal/fixture tests. This also restores the former AP name. Preserve all
pre-existing sketch, weather-header, setup-password, persistence and application edits.
