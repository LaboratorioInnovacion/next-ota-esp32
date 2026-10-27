This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Measurement ingestion contract

`POST /api/esp32` requires `Authorization: Bearer <weather-token>`, using the
server-only `ESP32_AUTH_TOKEN` shared with bulk deletion (configuration below).
Missing/invalid server configuration returns 503; missing, malformed, or incorrect
authentication returns 401 before reading the body or loading persistence.
Diagnostics uses its separate `ESP32_DIAGNOSTICS_TOKEN`, never this credential.

`POST /api/esp32` and `POST /api/weather` accept JSON objects up to 2048 streamed
bytes. The legacy `/api/weather` route still ignores Authorization; it is not
protected by this change.

| Field | Accepted values |
| --- | --- |
| `mac` | Six colon-separated hexadecimal bytes; casing is preserved, not normalized |
| `temperature` | Finite JSON number, -80 through 100 °C (broad environmental range, including DHT22) |
| `humidity` | Finite JSON number, 0 through 100 percent |
| `lat`, `lon` | Optional pair of finite numbers: [-90, 90] and [-180, 180]; zero is valid |
| `name` | Optional string on ESP32; still required and nonempty on weather |

Omit **both** coordinates to retain a saved location (or leave a new station's
location null). Partial pairs, nulls, and numeric strings are rejected; no
fallback location or coordinate aliases are introduced. Coordinates and readings
persist in the same transaction. A nonempty name, trimmed of surrounding whitespace,
updates the station matched by its exact MAC without changing its ID or reading
history. An omitted, null, empty, or whitespace-only name retains the saved name;
new stations without a usable name default to `ESP32_<last four MAC characters>`.
Weather still rejects omitted, null, and empty names. Receipt-time timestamps and
diagnostics fields retain their existing semantics.

After authentication, invalid measurements or malformed JSON return 400; internal failures return a
generic 500. Successful response schemas are unchanged. Offline regression tests:
`node --test tests/*.test.mjs` from `my-app`; no database is required.

## Protect bulk reading deletion

`DELETE /api/readings/delete-all` requires `Authorization: Bearer <weather-token>`.
Set server-only `ESP32_AUTH_TOKEN` to the **same existing credential sent by the
meteorological ESP32**, not `ESP32_DIAGNOSTICS_TOKEN`. Anyone holding that shared
credential can delete all readings and submit ESP32 measurements.

- **Vercel:** add `ESP32_AUTH_TOKEN` in the project's Environment Variables settings
  for the intended environment, then create a new deployment containing this fix.
- **VPS:** the app-only Compose deployment reads the dedicated runtime file
  `/opt/next-ota-esp32-vps/shared/app-auth.env` using raw format. It must contain only
  `ESP32_AUTH_TOKEN`, be owned by the deployment user with mode `0600`, and reside
  in the private `0700` shared directory. Validation fails closed without repair.
  Do not alter the generated DB-only credentials file to provision this credential.
- **Local/manual:** supply the variable securely to the server and separately to
  the REST client's process environment for the root `api.http` example. Never
  commit its value, put it in a URL, expose it to browser code, or use `NEXT_PUBLIC_`.

The value must be nonempty printable ASCII without whitespace; no diagnostics-only
length or URL-safe alphabet restriction applies. Missing/invalid server configuration
returns 503. Missing, malformed, or incorrect bearer authentication returns 401.
Rejections do not load persistence or parse the request body. Authorized success
and sanitized database-error responses retain their existing contracts.

Offline verification: `node --test tests/readings-delete.test.mjs` from `my-app`.
Do not verify by deleting production data. ESP32 POST protection requires a new
deployment containing this change on each host; provisioning the variable alone
does not protect an older build. This change does not alter deployed DELETE protection.

The manual `vps-private.yml` application workflow uses the `vps-app` environment,
restricted to `main` without a human approval gate. Its explicit enablement flag,
immutable revision checks, tests and SSH verification remain required. Database
bootstrap still uses the separately reviewed `vps-private` environment.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
