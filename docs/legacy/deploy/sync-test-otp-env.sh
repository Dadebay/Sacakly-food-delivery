#!/bin/sh
set -eu

cd "$(dirname "$0")"

pending_file=.test-otp.pending.env
runtime_file=.env.production
temporary_file=.env.production.test-otp.tmp

cleanup() {
  rm -f "$pending_file" "$temporary_file"
}
trap cleanup EXIT HUP INT TERM

test -s "$pending_file"
test -s "$runtime_file"

phones=$(sed -n 's/^LONG_LIVED_TEST_OTP_PHONES=//p' "$pending_file" | tail -n 1)
code=$(sed -n 's/^LONG_LIVED_TEST_OTP_CODE=//p' "$pending_file" | tail -n 1)
expires_at=$(sed -n 's/^LONG_LIVED_TEST_OTP_EXPIRES_AT=//p' "$pending_file" | tail -n 1)

if grep -Ev '^(LONG_LIVED_TEST_OTP_PHONES|LONG_LIVED_TEST_OTP_CODE|LONG_LIVED_TEST_OTP_EXPIRES_AT)=' "$pending_file" | grep -q .; then
  echo "Unexpected key in the pending test OTP configuration" >&2
  exit 1
fi
if ! printf '%s\n' "$phones" | grep -Eq '^\+993[0-9]{8}(,\+993[0-9]{8}){0,9}$'; then
  echo "Invalid test OTP phone allowlist" >&2
  exit 1
fi
if ! printf '%s\n' "$code" | grep -Eq '^([0-9]{4}|[0-9]{6})$'; then
  echo "Invalid test OTP code" >&2
  exit 1
fi
if ! printf '%s\n' "$expires_at" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(Z|[+-][0-9]{2}:[0-9]{2})$'; then
  echo "Invalid test OTP expiry timestamp" >&2
  exit 1
fi

umask 077
awk '
  !/^LONG_LIVED_TEST_OTP_ENABLED=/ &&
  !/^LONG_LIVED_TEST_OTP_PHONE=/ &&
  !/^LONG_LIVED_TEST_OTP_PHONES=/ &&
  !/^LONG_LIVED_TEST_OTP_CODE=/ &&
  !/^LONG_LIVED_TEST_OTP_EXPIRES_AT=/ &&
  !/^LONG_LIVED_TEST_OTP_PRODUCTION_ACKNOWLEDGED=/
' "$runtime_file" > "$temporary_file"
{
  printf 'LONG_LIVED_TEST_OTP_ENABLED=true\n'
  printf 'LONG_LIVED_TEST_OTP_PHONES=%s\n' "$phones"
  printf 'LONG_LIVED_TEST_OTP_CODE=%s\n' "$code"
  printf 'LONG_LIVED_TEST_OTP_EXPIRES_AT=%s\n' "$expires_at"
  printf 'LONG_LIVED_TEST_OTP_PRODUCTION_ACKNOWLEDGED=true\n'
} >> "$temporary_file"

if cmp -s "$runtime_file" "$temporary_file"; then
  exit 0
fi

backup_file=".env.production.before-test-otp-$(date -u +%Y%m%dT%H%M%SZ)"
cp -p "$runtime_file" "$backup_file"
chmod 600 "$backup_file" "$temporary_file"
mv "$temporary_file" "$runtime_file"
