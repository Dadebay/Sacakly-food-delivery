#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
api_health_url="http://127.0.0.1:4000/api/v1/health"
catalog_url="http://127.0.0.1:4000/api/v1/marketplace/cafes"
api_log="${TMPDIR:-/tmp}/sacakly-api-dev.log"
api_pid=""

echo "Preparing customer USB debug"

if ! curl --fail --silent --max-time 3 "$catalog_url" >/dev/null; then
  if ! docker info >/dev/null 2>&1; then
    echo "Starting Docker Desktop"
    open -a Docker
    for ((attempt = 0; attempt < 60; attempt++)); do
      if docker info >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "Docker Desktop did not become ready" >&2
    exit 1
  fi

  cd "$repo_root"
  docker compose up -d
fi

if ! curl --fail --silent --show-error --max-time 2 "$api_health_url" >/dev/null 2>&1; then
  echo "Starting Saçakly API (log: $api_log)"
  cd "$repo_root"
  npm run dev:api >"$api_log" 2>&1 &
  api_pid=$!
fi

for ((attempt = 0; attempt < 60; attempt++)); do
  if curl --fail --silent --max-time 3 "$catalog_url" >/dev/null; then
    break
  fi
  if [[ -n "$api_pid" ]] && ! kill -0 "$api_pid" 2>/dev/null; then
    echo "Saçakly API exited during startup. See $api_log" >&2
    exit 1
  fi
  sleep 1
done

if ! curl --fail --silent --max-time 3 "$catalog_url" >/dev/null; then
  echo "Saçakly catalog did not become ready. Check Docker and $api_log" >&2
  exit 1
fi

adb reverse tcp:4000 tcp:4000
echo "Saçakly catalog ready; Android USB port 4000 forwarded. Flutter debug can start."
echo "CUSTOMER_API_READY"

if [[ -n "$api_pid" ]]; then
  wait "$api_pid"
else
  # Keep the VS Code background task active while an independently started API runs.
  while curl --fail --silent --max-time 3 "$catalog_url" >/dev/null; do
    sleep 10
  done
fi
