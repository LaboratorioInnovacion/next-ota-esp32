# Distinguish sensor faults from stale connectivity

Diagnostics are implemented but **disabled by default**. Weather delivery remains independent: both existing destinations, five-minute success cadence and one-minute failure retries. No firmware build, flashing, migration or deployment is implied.

## Enable only after deployment and TLS verification

1. Back up the database. Review and apply the additive `my-app/prisma/migrations/20261023010000_diagnostics/migration.sql` through the approved migration process, after the existing bootstrap is correctly baselined/applied. Never replay the bootstrap against an existing unbaselined database.
2. Regenerate Prisma Client and deploy the app. Supply server-only `ESP32_DIAGNOSTICS_TOKEN` via the deployment secret mechanism: a dedicated high-entropy URL-safe token (32–256 characters), never a `NEXT_PUBLIC_` variable or setup AP credential. Missing/invalid configuration makes POST return 503.
3. Copy `DiagnosticsLocal.example.h` to ignored `DiagnosticsLocal.h`. Privately supply the same dedicated token and independently verified root CA PEM(s) covering both hosts. Do not copy a fetched leaf certificate or enable insecure TLS.
4. Identify the real FQBN, Arduino ESP32 core, partitions and libraries. Validate certificate-chain/hostname/expiry rejection and clock behavior on that exact core before setting `ESP32_DIAGNOSTICS_TLS_APPROVED` to 1. APIs were checked against Espressif core 3.3.4 documentation/source, not compiled against the unknown installed device core.
5. Build and flash only with separate authorization. Verify both deployed routes and serial status without printing tokens. An unsupported target backs off instead of blocking the healthy one.

The dedicated HTTPS client uses `setCACert`, disabled redirects, a three-second handshake limit and three-second connect/read timeouts. SNTP starts asynchronously after Wi-Fi readiness; a synchronization callback and plausible epoch are required before any authenticated POST. The loop never waits for NTP. SNTP itself is unauthenticated: validate the deployment time source/network threat model; this is not a claim of authenticated time. Existing weather/OTA/MQTT transports remain unchanged and are **not established as CA-verified**. Never send the diagnostic token through their legacy convenience transport.

## Contracts

| Route | Contract |
|---|---|
| `POST /api/diagnostics` | Dedicated `Authorization: Bearer …`; JSON ≤2048 bytes; `mac`, `name` (1–64 printable ASCII), `version` (1–64 printable ASCII), `bootId` (16 lowercase hex), `uptimeMs` (nonnegative safe integer), `sensorStatus` (`ok/error/unknown`), `errorCode` (`DHT_INVALID_SAMPLE` for error, otherwise `NONE`). Rejects extra fields, client timestamps and measurements. Auth precedes parsing/mutation. |
| `GET /api/diagnostics?mac=AA:BB:CC:DD:EE:FF&limit=20` | Public safe projection: receipt time, sensor state/code, version, uptime. MAC required, limit 1–100 (default 20). No credentials, boot identifiers or arbitrary errors returned. |
| `GET /api/stations` | Adds `lastSeenAt`, `sensorStatus`, `sensorErrorCode`, `firmwareVersion`, `lastValidReadingAt`, `reason`; derives online freshness instead of trusting stored static status. |

Example requests, using an already privately configured environment (do not use shell tracing):

```sh
curl --get "$APP_ORIGIN/api/diagnostics" --data-urlencode "mac=$STATION_MAC" --data-urlencode 'limit=20'
# The payload file follows the POST contract above and contains no token.
curl --request POST "$APP_ORIGIN/api/diagnostics" \
  --header "Authorization: Bearer ${ESP32_DIAGNOSTICS_TOKEN:?set privately}" \
  --header 'Content-Type: application/json' --data-binary @diagnostic.json
```

Do not run these against production without authorization. Shell-expanded bearer headers can be visible to local process inspection; use a private curl configuration/header file where required by the host security model. Never put credentials in query strings.

## Meaning of the status

- A diagnostic is due immediately after the first DHT sample, including invalid samples, then approximately every 60 seconds per target. Failures back off 2/4/8/16 minutes (bounded); 404/405 wait 15 minutes, 401/403 one hour. Each destination owns its timer; these synchronous bounded requests still add loop latency. There is no offline queue or delivery guarantee.
- Firmware classifies DHT11 samples only when finite and temperature 0–50°C, humidity 0–100%; zero remains valid. Errors send only a bounded code, never fake measurement zeros. Recovery is reported by the next diagnostic.
- Uptime accumulates unsigned 32-bit elapsed deltas into 64 bits across `millis()` rollover; the loop must run at least once per rollover (~49.7 days). It is not an absolute timestamp and is capped at JavaScript's safe integer maximum.
- Server time is captured after a per-MAC transaction lock. Same-boot older/duplicate uptime cannot overwrite the latest diagnostic or refresh freshness. Different boot IDs are ordered by receipt, not invented device time; there is no cross-boot replay guarantee. At most 100 events per station are retained atomically, including diagnostic-only stations with no measurements.
- `lastValidReadingAt` is the existing latest **stored measurement receipt** (`Reading.timestamp`), not last successful sensor sample time. Diagnostics never modify readings or infer sample timestamps from uptime. Historical measurement validation and legacy anonymous measurement/delete APIs are unchanged risks, not repaired by this feature.
- With diagnostics, freshness expires after 3 minutes; legacy devices use the latest reading with a 15-minute threshold and unknown sensor state. Fresh + sensor error means connected with sensor failure. Stale means missing/delayed signal, **not proven powered off**. Cards and details show signal and measurement receipt separately. Browser polling refreshes derived status.

## Verification and rollback

Run `bash firmware/EspOta/tests/run-host-tests.sh` and, in `my-app`, `node --test tests/*.test.mjs`. These use host policy code/mocks/schema diffs only, not hardware or a live database. Build with a synthetic unreachable `DATABASE_URL` to avoid production reads. Database lock behavior and actual TLS/core compatibility still need authorized integration verification.

Rollback order: disable firmware diagnostics / remove the server token, roll back app API/UI code and regenerate its matching client, then leave the additive nullable columns/table in place. Do not drop data as a routine rollback. Existing firmware, weather ingestion and historical readings remain usable; apply migration **before** new app code because its station queries select the added columns. Old code tolerates the additive schema, new code does not tolerate a missing migration.
