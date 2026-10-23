#!/bin/sh
set -eu
umask 077
sha=${1:?Full Git SHA required}
case "$sha" in *[!0-9a-f]*|'') exit 2 ;; esac
test "${#sha}" -eq 40
base=/opt/next-ota-esp32-vps
test "$(pwd -P)" = "$base/releases/$sha/app"
# Remove ephemeral registry credentials even when preflight validation fails.
export DOCKER_CONFIG="$PWD/.docker"
trap 'rm -rf -- "$DOCKER_CONFIG"' EXIT
exec 9>"$base/bootstrap.lock"
flock -n 9
shared="$base/shared"
# This path may only reuse the completed bootstrap; never initialize or repair.
test -f "$base/bootstrap-completed-sha"
test -f "$shared/.env"
python3 prepare-env.py "$shared"
project=next-ota-esp32-vps
test "$(docker volume inspect "${project}_pgdata" --format '{{index .Labels "com.docker.compose.project"}}')" = "$project"
test "$(docker network inspect "${project}_database" --format '{{index .Labels "com.docker.compose.project"}}')" = "$project"
db=$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=db)
test -n "$db"
test "$(docker inspect "$db" --format '{{.State.Health.Status}}')" = healthy
# Compose must use only the validated file, not inherited credential overrides.
unset VPS_DB_ADMIN_PASSWORD VPS_APP_DB_PASSWORD
export APP_IMAGE="ghcr.io/laboratorioinnovacion/next-ota-esp32:$sha"
# Registry authentication is release-scoped, never the server's global config.
compose() {
  docker compose -p next-ota-esp32-vps --env-file "$shared/.env" -f compose.yml "$@"
}
compose config --quiet
compose pull app
# The app-only Compose file cannot recreate the DB or apply schema commands.
compose up -d --no-deps --wait --wait-timeout 180 app
for path in / /api/stations; do
  test "$(curl --max-time 10 -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3030$path")" = 200
done
printf '%s\n' "$sha" > deployed-sha
printf 'Private deployment healthy: %s\n' "$sha"
