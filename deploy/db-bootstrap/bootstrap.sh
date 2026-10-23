#!/bin/sh
set -eu
umask 077
sha=${1:?Full commit SHA required}
printf '%s' "$sha" | grep -Eq '^[0-9a-f]{40}$'
base=/opt/next-ota-esp32-vps
test "$(pwd -P)" = "$base/releases/$sha/deploy/db-bootstrap"
exec 9>"$base/bootstrap.lock"
flock -n 9
project=next-ota-esp32-vps
volume=${project}_pgdata
network=${project}_database
before=$(mktemp)
after=$(mktemp)
trap 'rm -f "$before" "$after"' EXIT
inventory() {
  entries=$(docker ps -a --filter "label=com.docker.compose.project!=$project" \
    --format '{{.ID}} {{.Names}} {{.Image}} {{.State}}') || return 1
  printf '%s\n' "$entries" | sort
}
inventory > "$before"
# Query errors fail closed; no fallback treats an inaccessible daemon as empty.
volumes=$(docker volume ls --format '{{.Name}}')
networks=$(docker network ls --format '{{.Name}}')
containers=$(docker ps -aq --filter "label=com.docker.compose.project=$project")
compose() {
  docker compose -p "$project" --env-file "$base/shared/.env" -f compose.yml "$@"
}
if printf '%s\n' "$volumes" | grep -Fxq "$volume"; then
  # Existing clusters are verification-only. Never restart, initialize or repair.
  test -f "$base/bootstrap-completed-sha"
  python3 ../vps/prepare-env.py "$base/shared"
  test "$(docker volume inspect "$volume" --format '{{index .Labels "com.docker.compose.project"}}')" = "$project"
  test "$(docker network inspect "$network" --format '{{index .Labels "com.docker.compose.project"}}')" = "$project"
  test -n "$containers"
else
  test ! -e "$base/shared"
  test ! -e "$base/bootstrap-completed-sha"
  test -z "$containers"
  if printf '%s\n' "$networks" | grep -Fxq "$network"; then
    exit 1
  fi
  # Refuse colliding container names, including containers with missing labels.
  names=$(docker ps -a --format '{{.Names}}')
  if printf '%s\n' "$names" | grep -Eq '^next-ota-esp32-vps[-_]'; then
    exit 1
  fi
  python3 ../vps/prepare-env.py "$base/shared"
  chmod 755 ../vps/init-db.sh
  chmod 644 schema.sql
  compose up -d --wait --wait-timeout 150 db
fi
test "$(compose ps -q db)" = "$containers" || test -z "$containers"
test "$(compose ps --format '{{.Health}}' db)" = healthy
db=$(compose ps -q db)
test -n "$db"
test "$(docker inspect "$db" --format '{{json .HostConfig.PortBindings}}')" = '{}'
# Authenticate over TCP using each role's own credential; no seed or test writes.
compose exec -T db sh -eu -c '
  export PGPASSWORD="$POSTGRES_PASSWORD"
  psql -X -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1
' < verify.sql
compose exec -T db sh -eu -c '
  export PGPASSWORD="$VPS_APP_DB_PASSWORD" PGOPTIONS="-c default_transaction_read_only=on"
  psql -X -h 127.0.0.1 -U next_ota_vps_app -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 \
    -c '\''SELECT "id" FROM "Station" LIMIT 0; SELECT "id" FROM "Reading" LIMIT 0; SELECT "id" FROM "Diagnostic" LIMIT 0;'\''
'
inventory > "$after"
cmp -s "$before" "$after"
if test ! -e "$base/bootstrap-completed-sha"; then
  (set -C; printf '%s\n' "$sha" > "$base/bootstrap-completed-sha")
fi
printf 'DB_BOOTSTRAP_VERIFIED unrelated_container_inventory_unchanged\n'
