# Configure one weather station, step by step

Use **this folder's `EspOta.ino`**, not another firmware sketch in the repository.
Configure and verify **one pilot board before preparing a fleet**. This guide
describes the checked-in source; it does not certify a compiled binary, live
backend, or hardware installation.

> **Hardware safety:** if a board or sensor becomes unusually hot, disconnect
> power and investigate the hardware before reconnecting it. A firmware update
> is not evidence that overheating has been fixed.

## 1. Get the complete sketch and prepare the board

1. Download/extract the repository or use a complete local checkout. Keep the
   entire **`firmware/EspOta/` folder** together: the sketch needs its adjacent
   `.cpp`/`.h` files and generated portal assets. Downloading only `EspOta.ino`
   is insufficient.
2. Identify the exact ESP32 board, flash size, installed Arduino-ESP32 core,
   library versions and OTA-capable partition layout. A module marking alone
   does not establish these settings. Use your board's documented toolchain;
   no board profile, installation command or partition scheme is prescribed here.
3. The source currently selects **DHT11 on GPIO15** (`DHTTYPE` / `DHTPIN`). With
   power disconnected, check your actual sensor/module wiring against its and
   the board's documentation. This guide does not establish a safe supply
   voltage or pinout for an unspecified module.
4. Have a **2.4 GHz WiFi network**, its exact SSID and WPA passphrase, a phone,
   and access to the physical serial console ready. The sketch uses the DHT
   and PubSubClient libraries; their installed versions must match your build.

No validated ESP32 binary is supplied by this documentation change. The authoring
environment has no `arduino-cli`, `pio` or `platformio`; actual board compilation,
binary/OTA-slot fit and hardware behavior remain unverified.

## 2. Set this station's firmware defaults

Open [EspOta.ino](EspOta.ino). Edit the existing constants near the top; do not
add a second set. These are **synthetic examples**, not deployment coordinates:

```cpp
constexpr float DEFAULT_LATITUDE = 12.5f;
constexpr float DEFAULT_LONGITUDE = -45.25f;
constexpr char STATION_NAME[] = "Pilot station";
constexpr char STATION_MAC_OVERRIDE[] = "";
constexpr uint32_t DEFAULT_SEND_INTERVAL_SECONDS = 300;
```

| Setting | What to enter |
| --- | --- |
| `STATION_NAME` | A meaningful fallback name, 1–64 UTF-8 bytes, without control characters. Accented characters can use more than one byte. |
| `DEFAULT_LATITUDE` | Your station's latitude, finite and between −90 and 90. |
| `DEFAULT_LONGITUDE` | Your station's longitude, finite and between −180 and 180. |
| `STATION_MAC_OVERRIDE` | Normally leave empty: the board uses its real WiFi MAC as HTTP station identity. |
| `DEFAULT_SEND_INTERVAL_SECONDS` | Weather send interval in whole seconds, 60–86400 (1 minute–24 hours); default 300 (5 minutes). |

Only use a MAC override when deliberately retaining an existing application's
station identity. Its format is six colon-separated hexadecimal octets. An
invalid override warns on serial and falls back to the hardware MAC. The
backend keys weather stations by the **exact MAC string, including letter case**:
changing it can create another station; using the same override on two boards
merges their readings. For a new identity shared with diagnostics, use uppercase
(diagnostics normalize MACs separately).

The override affects **weather and diagnostic HTTP JSON only**. It does not
change the radio MAC, setup AP suffix, MQTT identity or OTA targeting. Changing
the weather name while keeping the same HTTP MAC updates the existing station's
name on its next accepted reading, preserving its history.

**Saved settings take priority:** a normal upload without an explicit erase
normally preserves NVS, including WiFi and portal name/location/interval overrides.
Changing these source defaults may therefore not change the effective values.
To return to defaults, successfully submit setup with the name blank and both
coordinates blank and the send interval blank. Do not erase all flash as a routine configuration step.

## 3. Arrange setup access and backend authorization

The setup password and the router's WiFi password are **different credentials**.
Use the configuration in [SetupConfig.h](SetupConfig.h), specifically
`provisioning::TemporarySharedSetupPassword`. Do not copy its actual value into
documentation, screenshots, tickets or shared logs.

- A valid nonempty value (8–63 printable ASCII bytes) takes precedence over a
  previously saved random setup password. Obtain it privately from the person
  preparing the firmware; this shared value is not printed on serial.
- If it is empty, setup uses a persisted random per-device password, printed
  only on the physical serial console when setup opens. Record it privately.
- An invalid nonempty value disables setup; there is no open-AP fallback.

For a shared credential used by **both setup and weather**, choose 8–63
printable ASCII bytes **without spaces**: setup accepts spaces, but the backend's
Bearer-token validation does not. Replace the shared test credential privately
before deployment and coordinate the matching server configuration.

**Important coupling:** weather POSTs use the valid **configured shared setup
credential** as `Authorization: Bearer <credential>`. They never send the saved
random AP password. Empty/random-per-device mode omits this header and will not
authenticate to the protected backend with the current firmware.

The backend operator must securely configure the matching **`ESP32_AUTH_TOKEN`**
in each receiving service's environment: Vercel's **Production** environment for
the Vercel service and the VPS service's secure environment for the other
destination. Do not put this token in public/client-side configuration. This is
a prerequisite to coordinate with the operator, not a deployment or database
procedure to run as part of station setup.

> **Transport limitation:** the existing weather HTTPS path supplies no trusted
> CA, so server authentication is not established. MQTT also uses an insecure
> TLS configuration. Treat the shared credential as exposed to impersonation
> risk; this guide does not fix or certify transport security.

## 4. Build, upload and inspect startup

1. Open **`firmware/EspOta/EspOta.ino`** in your configured ESP32 development
   environment. Build for the actual board/core/libraries/partition layout and
   check the resulting binary fits before uploading.
2. Upload using that board's documented procedure, preserving NVS unless a
   separate, explicitly authorized maintenance task requires otherwise. No
   erase, upload, flash or OTA command was executed to write this guide.
3. Open the serial monitor at **115200 baud**. Confirm startup and note the
   hardware `MAC:` privately for comparison with your intended HTTP identity.
4. The device tries known WiFi networks first. If none connects, look for
   `Local setup AP:`. If a saved network connects, setup need not open: do not
   erase saved data merely because you cannot see the AP. There is no assumed
   setup button or implemented browser reset endpoint.

## 5. Enter WiFi and optional station details from your phone

1. Join **`estacionm-nodo-xxxx`** with the setup password from step 3. The four
   lowercase hex digits are the hardware station MAC's last two bytes; the
   suffix is not globally unique. Keep the phone connected despite the
   **no Internet** warning. The AP permits one client at a time.
2. If no sign-in window opens, browse to **`http://192.168.4.1`** (not HTTPS).
   This address serves setup **only while the AP is active**, not on the
   router's normal network. Private DNS/browser behavior can prevent a popup.
3. Manually type the exact **SSID** and router/hotspot **password**. There is no
   network scan or QR-photo upload. Use the password reveal/hide control to
   check typing if needed. SSID accepts 1–32 bytes; WPA passphrases accept
   8–63 printable ASCII bytes. Open networks and raw 64-digit PSKs are unsupported.
4. Optionally fill the station name, coordinate pair and weather send interval:

   | Field | Enter a value | Leave blank |
   | --- | --- | --- |
   | Name | Valid UTF-8, at most 64 bytes; surrounding ASCII whitespace is trimmed, control characters rejected. | Clear the saved name override and use `STATION_NAME`. |
   | Latitude and longitude | Enter **both**, decimal point, latitude −90…90 and longitude −180…180. | Leave **both** blank to clear the saved pair and use firmware defaults. |
   | Weather send interval (seconds) | Whole decimal integer, **60–86400**; no decimal points, exponent notation or signs. | Clear the saved override and use `DEFAULT_SEND_INTERVAL_SECONDS` immediately after a successful save and after reboot. |

   Coordinates are deliberately not prefilled; re-enter a pair you want to keep.
   Name prefill shows only a saved override, not the firmware fallback. Decimal
   commas, exponent/hex notation and incomplete pairs are rejected. Zero is a
   valid coordinate, not a blank value. No GPS permission is needed.
   The interval field shows only a saved override (otherwise blank); the help
   separately shows the current effective interval and firmware default.
5. Review all fields and submit once. Allow roughly 15 seconds for the
   association attempt and check serial for the result:
   - `New network connected and saved; setup closed.` confirms the save path.
   - `New network failed; existing networks preserved.` means retry the input
     while setup remains available.
   - `Network connected; WiFi/location/name/interval save NOT fully confirmed. Review configuration.`
     means association succeeded but persistence is uncertain. **The AP can
     close even on a save failure**; do not treat its disappearance as proof.
6. Return your phone to its usual Internet connection. A successful association
   closing the ESP's AP is normal; the phone cannot browse the local page then.

Use a second phone/computer if your phone cannot both provide the hotspot and
join the ESP AP. Keep the hotspot visible and enabled. Avoid an upstream LAN
using `192.168.4.0/24`, which conflicts with the setup subnet.

Setup lasts **10 minutes**, then remains closed for at least **5 minutes** before
another failed network cycle can reopen it. Submissions are refused in its last
13 seconds. Known networks retry after a failed cycle without rebooting.
WiFi association alone does not prove Internet access or backend reachability.

## 6. Confirm readings reach the intended dashboard

The DHT11 is sampled every **10 seconds**. Weather delivery needs a valid current
sample and ready WiFi; it pauses while setup is active. `Error sensor DHT11`
means investigate the sensor before expecting weather POSTs.

Both destinations are configured in [WeatherDelivery.h](WeatherDelivery.h):

1. `https://miniestaciones.vercel.app/api/esp32`
2. `https://estaciones.modernshop.com.ar/api/esp32`

Both destinations are pending **as soon as WiFi is ready and setup is closed**:
there is no initial five-minute wait. A valid sensor sample is still required;
the next DHT sample can take up to **10 seconds**, and an invalid sensor delays
weather delivery until it recovers. WiFi association is not proof of Internet
access: only actual POST results establish delivery, with no extra probe.
Each successful destination then waits its configured interval (**5 minutes by
default**) from its own completed send; failures retry no sooner
than **60 seconds from that destination's last attempt start**. The two timers
are independent. An observed disconnected-to-ready transition makes both
destinations pending again, without bypassing the 60-second attempt backoff;
repeated connected polls do not reset timers. Changing the effective interval
starts a new interval for destinations already waiting after success, without
bursting or clearing pending retries. Sends are synchronous, so a slow
destination can delay the loop. Sensor, diagnostics and MQTT cadences are unchanged.

The request shape is illustrated below with **synthetic data and a placeholder
credential**, not an instruction to send a test request:

```http
POST /api/esp32
Content-Type: application/json
Authorization: Bearer <configured-shared-credential>

{"mac":"02:00:00:00:00:01","name":"Pilot station","version":"example","temperature":22.5,"humidity":55.0,"lat":12.500000,"lon":-45.250000}
```

Serial prints `POST enviado (200): ...` on a normal backend success. Firmware
counts any 2xx as success, but **the log does not identify the destination**:
one 200 does not establish that both services received data. Confirm each
intended dashboard separately, comparing the HTTP MAC, name, coordinates and
**a new reading's timestamp/value**, not just an existing station's presence.
This application's visible dashboard polls about every **60 seconds** after a
request completes; refocus or refresh it if needed. Reading timestamps represent
server receipt, not a sensor-provided observation time.

### If delivery fails

| Evidence | Next check |
| --- | --- |
| No POST yet | Active setup, WiFi readiness, valid DHT reading (up to 10 seconds for the next sample), and per-destination retry backoff. There is no initial five-minute timer. |
| HTTP 401 | Configured shared credential and that destination's `ESP32_AUTH_TOKEN` must match; a random AP password is not sent. |
| HTTP 503 | Receiving service's ingestion token configuration is missing or invalid; ask its operator. |
| HTTP 400 | Payload validation, especially MAC, numeric measurements and paired coordinates. |
| HTTP 500 | Operator should inspect server/persistence errors; do not reset or migrate the database to configure a station. |
| Negative transport code / no response | Router Internet access, DNS, destination availability and HTTPS transport; distinguish these from an HTTP rejection. |
| New defaults not visible | Saved portal overrides still take priority. Clear them through a successful blank-field setup submission when setup is available. |

These HTTP meanings come from the local backend source, not a live-service test.
Do not share raw logs containing private setup passwords or authorization headers.

## Pilot acceptance checklist

- [ ] Correct sketch, board, libraries and partition layout; build and size checked.
- [ ] Hardware remains healthy; valid DHT readings, no unexplained overheating.
- [ ] Intended station identity is unique; name and coordinates are correct.
- [ ] Serial confirms saving; a normal restart retains the intended configuration.
- [ ] A fresh reading appears on each intended destination, with the expected MAC.
- [ ] Only after these checks, repeat per board; never clone a shared MAC override.

## Maintainer notes

WiFi entries are append-only NVS slots in `station-wifi` (up to five saved
networks, followed by up to five compiled fallbacks). A changed password uses
another slot; full/corrupt storage needs a separately authorized service workflow.
Name, location and interval (`sendSeconds`) are separate values in `station-meta`. Metadata is saved only
after fresh association and confirmed WiFi storage. Cross-key writes and rollback
are not atomic under storage failure or power loss; verify uncertain saves.

Diagnostics are optional and separate from weather delivery. They require their
own token, trusted CA, explicit TLS approval and clock readiness; see
[DiagnosticsLocal.example.h](DiagnosticsLocal.example.h). Diagnostic names have
a separate ASCII contract; a portal weather name does not change MQTT/OTA naming.
Do not configure diagnostics merely to make normal weather readings work.

For portal work, edit [portal/setup.html](portal/setup.html),
[portal/setup.css](portal/setup.css) and [portal/setup.js](portal/setup.js), not
the generated `PortalAssets.h`. Existing host checks are available under
[tests/](tests/); they do not replace compilation, phone/AP isolation or hardware
testing. Local host/mock checks do not prove a real board build or delivery.
Firmware downloads reflect these changes only after a later commit/push and
build/publication; none is performed by editing this checkout.
