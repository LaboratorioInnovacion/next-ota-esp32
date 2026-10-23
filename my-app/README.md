This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Measurement ingestion contract

`POST /api/esp32` and `POST /api/weather` accept JSON objects up to 2048
streamed bytes. Authorization remains optional and ignored for compatibility;
this change does not secure those public measurement endpoints.

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
persist in the same transaction. Names remain creation-only, and receipt-time
timestamps and diagnostics fields retain their existing semantics.

Invalid measurements or malformed JSON return 400; internal failures return a
generic 500. Successful response schemas are unchanged. Offline regression tests:
`node --test tests/*.test.mjs` from `my-app`; no database is required.

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
