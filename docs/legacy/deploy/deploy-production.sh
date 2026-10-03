#!/bin/sh
set -eu

cd "$(dirname "$0")"

test -s .release.pending.env

runtime_env_file=$(sed -n 's/^ALOWALOW_ENV_FILE=//p' .release.pending.env | tail -n 1)
runtime_env_file=${runtime_env_file:-.env.production}
case "$runtime_env_file" in
  /*|*..*)
    echo "ALOWALOW_ENV_FILE must stay inside the deployment directory" >&2
    exit 1
    ;;
esac
test -s "$runtime_env_file"

compose_override=$(sed -n 's/^ALOWALOW_COMPOSE_OVERRIDE=//p' .release.pending.env | tail -n 1)
case "$compose_override" in
  /*|*..*)
    echo "ALOWALOW_COMPOSE_OVERRIDE must stay inside the deployment directory" >&2
    exit 1
    ;;
esac
if [ -n "$compose_override" ]; then
  test -s "$compose_override"
fi

set -- --env-file .release.pending.env --file docker-compose.production.yml
if [ -n "$compose_override" ]; then
  set -- "$@" --file "$compose_override"
fi
docker compose "$@" pull

if [ -s .release.env ]; then
  cp .release.env .release.previous.env
fi
mv .release.pending.env .release.env

set -- --env-file .release.env --file docker-compose.production.yml
if [ -n "$compose_override" ]; then
  set -- "$@" --file "$compose_override"
fi
if docker compose "$@" up -d --wait; then
  exit 0
fi

if [ -s .release.previous.env ]; then
  cp .release.previous.env .release.env
  previous_override=$(sed -n 's/^ALOWALOW_COMPOSE_OVERRIDE=//p' .release.env | tail -n 1)
  case "$previous_override" in
    /*|*..*)
      echo "Previous ALOWALOW_COMPOSE_OVERRIDE is unsafe" >&2
      exit 1
      ;;
  esac
  set -- --env-file .release.env --file docker-compose.production.yml
  if [ -n "$previous_override" ]; then
    test -s "$previous_override"
    set -- "$@" --file "$previous_override"
  fi
  docker compose "$@" up -d --wait
fi

exit 1
