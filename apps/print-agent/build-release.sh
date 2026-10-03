#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p dist
cp THIRD_PARTY_NOTICES.txt dist/THIRD_PARTY_NOTICES.txt
cp support/collect-logs.cmd "dist/Собрать логи.cmd"
cp support/collect-logs.command "dist/Собрать логи.command"
cp support/connect-printers.cmd "dist/Подключить аппараты.cmd"
cp support/rollback-printers.cmd "dist/Откатить подключение.cmd"
chmod +x "dist/Собрать логи.command"

release_version=${VERSION:-dev}
build() {
  local target_os=$1
  local target_arch=$2
  local suffix=$3
  local linker_flags="-s -w -X main.version=$release_version"
  if [[ "$target_os" == windows && -n "${WINDOWS_CONNECT_INTERFACE:-}" ]]; then
    linker_flags+=" -X 'main.windowsConnectInterface=$WINDOWS_CONNECT_INTERFACE'"
    linker_flags+=" -X 'main.windowsConnectReserved=${WINDOWS_CONNECT_RESERVED:-}'"
  fi
  CGO_ENABLED=0 GOOS="$target_os" GOARCH="$target_arch" \
    go build -trimpath -ldflags "$linker_flags" \
      -o "dist/a7-tagam-print-agent-$suffix" .
}

build darwin amd64 darwin-amd64
build darwin arm64 darwin-arm64
build windows amd64 windows-amd64.exe
build windows arm64 windows-arm64.exe
build windows 386 windows-386.exe
