# Bootstrap only the isolated Estaciones database

This manual CI route creates only a new PostgreSQL 16 cluster and its initial
Station, Reading and Diagnostic tables. It never builds or starts an app,
publishes a port, changes a proxy, seeds data or runs Prisma migrations.

## Execution gate

Dispatch `db-bootstrap.yml` from `main` with that revision's full commit SHA.
The `vps-private` environment requires explicit approval by the verified repository
administrator. Do not approve automatically. No runtime verification is claimed
until CI succeeds. Unavailable immutable review remains unavailable, not approval.

The dedicated SSH key disables forwarding and PTY but still grants root command
access. GitHub environment protection is not OS-level privilege isolation.

## Safety and recovery

- New resources use project `next-ota-esp32-vps`, its own internal network and volume.
- Credentials are generated once under `/opt/next-ota-esp32-vps/shared` (0700/0600).
- A pre-existing cluster is verification-only and requires a successful bootstrap marker.
- A partial initialization or existing release directory stops execution. Do not
  delete volumes, rotate credentials, repair automatically or blindly retry.
- A read-only SQL check validates role restrictions, tables, indexes and foreign keys;
  both database credentials are authenticated over TCP without test writes.
- Unrelated container IDs, names, images and running states must remain unchanged.

Forecast: no application build; PostgreSQL image may need a registry pull if absent
(the current VPS already has a roughly 419 MB unpacked PostgreSQL 16 image).
The new database is limited to 512 MB RAM and 0.5 CPU. Budget up to ten CI minutes.
Database creation remains CI-only; local tests do not provision a database.

Rollback boundary: this workflow and `deploy/db-bootstrap`, plus its two standalone
helpers in `deploy/vps`. Retiring the old automatic app workflow belongs to the same
publication. Removing source does not delete server data or revoke existing access.
