#!/bin/sh
set -eu
# Only the NEW isolated cluster executes this script on first initialization.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 <<'SQL'
\getenv app_password VPS_APP_DB_PASSWORD
CREATE ROLE next_ota_vps_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
REVOKE ALL ON DATABASE next_ota_vps FROM PUBLIC;
GRANT CONNECT ON DATABASE next_ota_vps TO next_ota_vps_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO next_ota_vps_app;
ALTER DEFAULT PRIVILEGES FOR ROLE next_ota_vps_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO next_ota_vps_app;
ALTER DEFAULT PRIVILEGES FOR ROLE next_ota_vps_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO next_ota_vps_app;
SQL
