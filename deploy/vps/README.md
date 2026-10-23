# Prepare the private app against the existing VPS database

The app-only stack reuses the completed DB bootstrap, existing data and exact
credentials in `/opt/next-ota-esp32-vps/shared/.env`. It never initializes,
recreates, migrates or pushes a database schema. The app is **not deployed yet**.
Public ingress remains out of scope because ingestion/delete APIs lack authentication.

## Approval boundary

1. Review and publish the local changes only after separate approval.
2. Run **Prepare or deploy isolated private VPS** on the reviewed `main` revision.
   GitHub supplies the full image SHA automatically; an optional explicit SHA must
   match that revision. Leave `deploy_private=false` to prepare only the image.
3. Only after private-deployment approval, dispatch with `deploy_private=true`.
   The protected `vps-private` environment must allow the deployment and have
   `VPS_PRIVATE_DEPLOY_ENABLED=true`. No push-triggered VPS deployment is configured.

No commit, push, dispatch, image publication or remote change is authorized by
this preparation. Vercel's independent Git integration is unchanged.

## Isolation contract

| Resource | App-only behavior |
| --- | --- |
| Project | `next-ota-esp32-vps`; operates only on service `app` with `--no-deps` |
| Image | `ghcr.io/laboratorioinnovacion/next-ota-esp32:<full-git-sha>` |
| Release | `/opt/next-ota-esp32-vps/releases/<sha>/app` |
| Database | Existing `next_ota_vps`, reached as `db` on `next-ota-esp32-vps_database` |
| Runtime role | Existing `next_ota_vps_app`; no owner credential passed to app |
| Credentials | Existing shared `.env`; byte-preserving validation, no generation |
| Networks | Existing dedicated internal DB network plus project-scoped outbound network |
| Access | `127.0.0.1:3030`; no proxy attachment or public binding |
| App limits | 768 MiB, 0.5 CPU |

Missing bootstrap marker, credentials, dedicated volume/network labels or a healthy
DB stop deployment. Recover missing credentials from a protected backup; never
regenerate passwords for the existing cluster. Do not reuse Vercel credentials.
The separate `deploy/db-bootstrap` workflow is one-time DB provisioning, not an
app-release step. The existing DB has no Prisma migration history: **never run
`prisma migrate deploy` or `prisma db push` against it**. Local migration SQL files
are comparison fixtures only, not a deployment instruction.

## CI prerequisites

Reuse the dedicated environment secrets already used by DB bootstrap:
`ESTACIONES_VPS_HOST`, `ESTACIONES_VPS_USER`, `ESTACIONES_VPS_SSH_KEY` and
`ESTACIONES_VPS_KNOWN_HOSTS`. Host keys must be verified; Python 3 and `flock` are
required on the VPS. Environment protection must be configured in GitHub; YAML
alone does not enforce reviewers. Registry credentials are release-scoped and
removed on exit, not saved as a global server login.

The Docker context excludes `.env*` and Vercel metadata. Builds use a synthetic,
unreachable DB URL and generate the Prisma client without connecting to the VPS.

## Verification and rollback

```sh
node --test deploy/vps/tests.mjs deploy/db-bootstrap/tests.mjs
node --test deploy/vps/schema.test.mjs
node --test my-app/tests/*.test.mjs
sh -n deploy/vps/init-db.sh deploy/vps/deploy-private.sh
git diff --check
```

Source tests cover app-only commands, credentials, isolation, and offline Prisma /
bootstrap SQL equivalence. Mock execution is **not** proof of a full Docker image
or app-to-PostgreSQL runtime. That remains a delivery gate, together with the
unavailable native review; neither is approved by passing these tests.

After an approved CI deployment, health checks require HTTP 200 on `/` and
read-only `/api/stations` over loopback. Access through an SSH tunnel; never use
ingestion or DELETE as probes. This is not public HTTPS acceptance.

Rollback requires a reviewed revert commit on `main`, built and deployed through
the same CI workflow with unchanged DB and credentials. The workflow deliberately
rejects an arbitrary older image SHA that differs from its selected source revision.
Never run `down -v`, drop data, or reverse schema automatically. For a first
deployment, stopping only this app requires separate approval; retain its DB,
volume and bootstrap release.
