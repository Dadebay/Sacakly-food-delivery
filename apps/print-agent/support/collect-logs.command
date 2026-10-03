#!/bin/zsh
set -eu
cd -- "${0:A:h}"
agent=./a7-tagam-print-agent
if [[ ! -x "$agent" ]]; then
  case "$(uname -m)" in
    arm64) agent=./a7-tagam-print-agent-darwin-arm64 ;;
    *) agent=./a7-tagam-print-agent-darwin-amd64 ;;
  esac
fi
exec "$agent" -export-logs
