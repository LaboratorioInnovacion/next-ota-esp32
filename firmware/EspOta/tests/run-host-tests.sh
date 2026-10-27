#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cache=${TMPDIR:-${HOME}/.cache/opencode/tmp/opencode}
mkdir -p "$cache"
binary=$(mktemp "$cache/espota-tests.XXXXXX")
trap 'rm -f "$binary"' EXIT
for source in policy_test.cpp weather_delivery_test.cpp diagnostics_test.cpp portal_test.cpp onboarding_test.cpp station_identity_test.cpp station_name_test.cpp; do
"${CXX:-g++}" -std=c++11 -Wall -Wextra -Werror -pedantic \
  -fsanitize=address,undefined -fno-sanitize-recover=all -fno-omit-frame-pointer \
  -I"$root/stubs" "$root/$source" -o "$binary"
"$binary"
done
