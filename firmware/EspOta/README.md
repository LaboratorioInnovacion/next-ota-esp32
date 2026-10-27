# Connect a station from your phone

This sketch retries known WiFi networks without rebooting. If none connects, it
opens a **password-protected, temporary local setup AP**. Optional compiled
networks, sensor pin, and MQTT OTA protocol remain unchanged. Setup also accepts
an optional persistent station display name and latitude/longitude pair.

## Configure each board

Edit the station configuration near the top of `EspOta.ino` before building:

```cpp
constexpr float DEFAULT_LATITUDE = 12.5f;    // Synthetic example, replace for this board.
constexpr float DEFAULT_LONGITUDE = -45.25f;
constexpr char STATION_MAC_OVERRIDE[] = ""; // Empty: use this board's real WiFi MAC.
constexpr char STATION_NAME[] = "Synthetic station"; // Default name; keep valid printable UTF-8, 1-64 bytes.
```

Defaults must be finite latitude −90 to 90 and longitude −180 to 180; invalid
sketch constants fail compilation. A valid saved portal pair takes priority.
To return to these defaults, submit both portal coordinate fields blank and
successfully connect/save the network. Fields are deliberately not prefilled.

If an application identity override is required, replace the empty string with
the intended station identifier (`<HH:HH:HH:HH:HH:HH>` denotes six hexadecimal
octets, not a literal value). No shared identifier is enabled by default.
Invalid overrides warn on serial and fall back to the real hardware MAC, even
if a previous override was configured. Overrides affect weather and diagnostic
HTTP JSON only: WiFi radio MAC, setup AP suffix, MQTT identity and OTA targeting
remain hardware-based. Configure the override before `begin()`.

**Identity risk:** weather ingestion preserves MAC letter case and uses the exact
string as its unique station key. Changing the identifier or its case can select
or create a different station; reusing one across boards merges their readings.
Diagnostics separately uppercase MACs: use uppercase for a new identity shared
by both HTTP paths. An existing lowercase/mixed-case weather identity does not
automatically merge with diagnostics. No database identity migration is performed.

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
   WPA password of a **2.4 GHz** router or phone hotspot manually.
   Optionally enter a **station name** and **both latitude and longitude**
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

### Station name persistence

- A valid saved portal name overrides `STATION_NAME` in weather HTTP JSON. Blank
  clears that override and immediately restores the firmware default after a
  successful setup; the same fallback applies after reboot or missing/invalid NVS.
- Leading/trailing ASCII whitespace is trimmed. Names allow accents, quotes and
  backslashes: valid UTF-8, at most **64 bytes**, no C0/C1 controls. Overlong input
  is rejected, never byte-truncated. The backend currently has no name length cap;
  this firmware bound limits NVS and request memory. JSON strings are escaped.
- The form prefills only the saved override, HTML-escaped, never the firmware
  fallback. WiFi credentials and the existing AP-local token check are still required.
  Invalid names or incomplete coordinates reject the entire request before any writes.
- Only fresh WiFi association and confirmed network storage permit metadata writes.
  `station-meta` / `stationName` stores one fixed-size UTF-8 value, verified by readback;
  clearing removes only that key. Location commits first; a failed name write attempts
  to restore the prior location and name. NVS/power failures are **not** a transaction
  across keys/namespaces: serial reports incomplete saves and durable rollback can
  remain uncertain. No WiFi, setup-password or unrelated metadata key is cleared.
- Name changes do not change HTTP MAC identity, station ID/history, hardware MAC,
  AP SSID/password, MQTT management name/topics or OTA targeting. Diagnostics retain
  the firmware name because their existing validator only accepts ASCII; diagnostic
  updates do not rename existing stations. The next weather receipt supplies the
  portal display name without changing that diagnostics contract.

### Location persistence

- Latitude is finite **−90 to 90**, longitude **−180 to 180**. Enter both or leave
  both blank; partial pairs, commas, exponent/hex syntax and nonfinite values are
  rejected. **`0, 0` is valid** (enter `0` in each field), not an unset sentinel.
- Blank fields clear the saved paired location key and use the sketch's
  `DEFAULT_LATITUDE` / `DEFAULT_LONGITUDE`, including after reboot. Zero is not blank.
- Only explicit submission followed by fresh WiFi association **and confirmed WiFi
  storage** can save or clear a location override. A failed connection never changes it. A
  network-storage failure skips the location write. Location-storage failure can
  leave the WiFi entry saved: the serial result does not claim complete success.
- The owned coordinate pair is a small versioned, checksummed Preferences blob in
  **`station-meta` / `location`**, separate from `station-wifi`. Write length and
  exact readback must match before the active coordinates change. Failure retains
  the active prior location and attempts to restore a known previous blob. If
  verification/rollback itself fails, the durable outcome is uncertain; a later
  reboot may load the last valid stored blob. There is no cross-namespace transaction.
- Clearing removes only the single `station-meta` / `location` key and confirms
  its absence before clearing the active override. A failed removal keeps the
  active override. Existing WiFi entries and other metadata are never erased.
- Boot loads saved coordinates after the sketch default; successful setup updates
  the same existing weather JSON `lat`/`lon` fields. No observation time is invented.
  Normal reboot/power loss retains both WiFi and location.

**Next.js receipt:** `/api/esp32` delegates to `measurement-http.mjs`, which validates
`mac`, `name`, `temperature`, `humidity`, and paired numeric `lat`/`lon` before
`ingest-reading.mjs` upserts by unique `Station.mac`. Coordinates update both new
and existing stations in the reading transaction and are exposed as
`latitude`/`longitude` by `station-data.mjs`. The weather JSON's `version` is ignored
by measurement validation; diagnostics own firmware-version metadata. A nonblank
`name` updates both new and existing stations without changing the MAC key or reading history. Both configured
weather destinations receive the effective coordinates and HTTP station identifier;
this describes local source behavior, not deployed-service compatibility.

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

### Manual setup page

The local page uses neutral Spanish, a mobile-first layout and accessible labels,
focus indicators, masked password/reveal control, status messages and busy feedback.
Manual entry and the protected POST form also work with JavaScript disabled.
The SSID suffix is the last two bytes of the public station MAC, lowercase hex;
it is stable, not globally unique, and unrelated to the unchanged setup password.

QR photo selection and decoding are not available. Enter the SSID and password
manually; nothing is submitted until you confirm the existing form POST.
Browser-native autocomplete settings, saved networks, setup authentication and
location validation remain available.

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

Source assets duplicated in the generated header are not separate firmware
copies: only included PROGMEM arrays enter the binary.
Flash/OTA slot fit is **unverified** until the actual FQBN, core and partition
layout are supplied and a binary is built. Do not flash this candidate based on
the source size alone.

Run `bash firmware/EspOta/tests/run-host-tests.sh` and
`node --test firmware/EspOta/tests/portal.test.cjs`. Node tests check generated
assets and execute the manual form script without decoder globals in a mocked DOM;
they are not real browser/phone or hardware validation. Those checks remain pending.

For the station identity/location boundary, also run:
`node --test firmware/EspOta/tests/station-contract.test.mjs my-app/tests/measurement.test.mjs`.
The native fixture exercises the production identity/location policies and sends
synthetic JSON through the actual Next.js handler with an in-memory persistence
double. It does not compile the Arduino serializer/Preferences adapters or contact
HTTP services or a database.

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

Portal-UX-only rollback: restore `WiFiProvisioning.cpp/.h`, `PortalRequest.h`,
the portal runner entry and these portal docs to their pre-change versions;
remove `PortalAssets.h`, `PortalIdentity.h`, `PortalStream.h`, `portal/`, and the
new portal tests. This also restores the former AP name. Preserve all
pre-existing sketch, weather-header, setup-password, persistence and application edits.

Station-configuration rollback: remove `StationIdentity.h` and its host test,
undo only the default/HTTP-identity wiring, paired-location clearing behavior,
and related tests/help text from this change. Preserve the pending QR removal,
weather authorization and all application edits. This rollback does not erase NVS.

Portal-name-only rollback: remove `StationName.h`, `tests/station_name_test.cpp`
and `tests/stubs/pgmspace.h`; undo only name parsing/persistence, streamed name
prefill, weather-name escaping, the `STATION_NAME` constant wiring, and their
tests/help text in the existing files. Regenerate `PortalAssets.h`. Retain the
pending QR removal, coordinates/MAC configuration, Next.js rename and POST auth.
The unused `station-meta` / `stationName` key may remain; do not erase NVS.
