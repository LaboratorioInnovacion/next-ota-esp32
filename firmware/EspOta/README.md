# Connect a station from your phone

This sketch retries known WiFi networks without rebooting. If none connects, it
opens a **password-protected, temporary local setup AP**. The three existing
compiled networks, sensor pin, location, and MQTT OTA protocol
remain unchanged.

## Phone setup

1. Use the supplied temporary setup password. **TEST ONLY:**
   `TemporarySharedSetupPassword` in `SetupConfig.h` configures the same password
   across devices. Change it before deployment. This override takes precedence
   over any old random `setup-pass` in NVS without changing stored credentials.
2. After known networks fail, join **`Station-Setup-XXXXXX`** on your phone with
   that password. Choose to stay connected even though there is no Internet.
3. Open **`http://192.168.4.1`** explicitly (not HTTPS). Enter the exact SSID and
   WPA password of a **2.4 GHz** router or phone hotspot and submit once. No app,
   Internet service, account recovery, or automatic captive-portal popup is needed.
4. Wait about 15 seconds. Successful association closes setup; wrong credentials
   leave it available for retry. **Serial confirms whether saving succeeded.**
   AP disappearance alone does not prove persistence if storage failed.

A hotspot must be switched on and visible during the test. A second phone or
computer may be needed to run the hotspot while browsing setup: some phones
cannot remain a hotspot and join another AP simultaneously. No scan/list is
provided; enter the SSID manually. No GPIO/button is assumed.

## Timing and persistence

| Behavior | Default |
| --- | --- |
| Network order | Up to five saved entries, then up to five owned compiled entries (currently three) |
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
  before parsing; use a target LAN subnet different from `192.168.4.0/24`.
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
