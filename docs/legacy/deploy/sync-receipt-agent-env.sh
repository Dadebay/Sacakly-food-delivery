#!/bin/sh
set -eu

cd "$(dirname "$0")"

pending_file=.receipt-agent.pending.env
runtime_file=.env.production
temporary_file=.env.production.receipt-agent.tmp

cleanup() {
  rm -f "$pending_file" "$temporary_file"
}
trap cleanup EXIT HUP INT TERM

test -s "$pending_file"
test -s "$runtime_file"

token=$(sed -n 's/^RECEIPT_AGENT_API_TOKEN=//p' "$pending_file" | tail -n 1)

if grep -Ev '^RECEIPT_AGENT_API_TOKEN=' "$pending_file" | grep -q .; then
  echo "Unexpected key in the pending receipt-agent configuration" >&2
  exit 1
fi
if [ "${#token}" -lt 12 ] || [ "${#token}" -gt 512 ]; then
  echo "Receipt-agent key must contain between 12 and 512 characters" >&2
  exit 1
fi
if ! printf '%s\n' "$token" | grep -Eq '^[[:graph:]]+$'; then
  echo "Receipt-agent key must contain printable non-space characters" >&2
  exit 1
fi

umask 077
awk '!/^RECEIPT_AGENT_API_TOKEN=/' "$runtime_file" > "$temporary_file"
printf 'RECEIPT_AGENT_API_TOKEN=%s\n' "$token" >> "$temporary_file"

if cmp -s "$runtime_file" "$temporary_file"; then
  exit 0
fi

backup_file=".env.production.before-receipt-agent-$(date -u +%Y%m%dT%H%M%SZ)"
cp -p "$runtime_file" "$backup_file"
chmod 600 "$backup_file" "$temporary_file"
mv "$temporary_file" "$runtime_file"
