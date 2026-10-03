#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
runtime_dir="${script_dir}/runtime"
downloads_dir="${runtime_dir}/downloads"
current_dir="${runtime_dir}/current"
previous_dir="${runtime_dir}/previous"
image="ghcr.io/project-osrm/osrm-backend:latest@sha256:3ac496ff8fd7e1af53846179d73d06a97f719c8ad2217d008ed868942398665c"
pbf_url="https://download.geofabrik.de/asia/turkmenistan-latest.osm.pbf"
pbf_file="${downloads_dir}/turkmenistan-latest.osm.pbf"
pbf_part="${pbf_file}.part"
refresh=false

if [[ "${1:-}" == "--refresh" ]]; then
  refresh=true
elif [[ -n "${1:-}" ]]; then
  echo "Usage: $0 [--refresh]" >&2
  exit 2
fi

mkdir -p "${downloads_dir}"
if [[ "${refresh}" == true || ! -s "${pbf_file}" ]]; then
  echo "Downloading the Turkmenistan OpenStreetMap extract..."
  curl \
    --fail \
    --location \
    --retry 8 \
    --retry-all-errors \
    --connect-timeout 20 \
    --continue-at - \
    --output "${pbf_part}" \
    "${pbf_url}"
  if [[ "$(wc -c < "${pbf_part}")" -lt 1000000 ]]; then
    echo "Downloaded OpenStreetMap extract is unexpectedly small" >&2
    exit 1
  fi
  mv "${pbf_part}" "${pbf_file}"
fi

source_sha="$(shasum -a 256 "${pbf_file}" | awk '{print $1}')"
if [[ -s "${current_dir}/.source.sha256" ]] &&
  [[ "$(<"${current_dir}/.source.sha256")" == "${source_sha}" ]] &&
  [[ -s "${current_dir}/turkmenistan-latest.osrm.cells" ]] &&
  [[ -s "${current_dir}/turkmenistan-latest.osrm.mldgr" ]]; then
  echo "Routing data is already prepared for the current OSM extract."
  exit 0
fi

build_dir="${runtime_dir}/build.$$"
cleanup() {
  if [[ -d "${build_dir}" ]]; then
    rm -rf "${build_dir}"
  fi
}
trap cleanup EXIT
mkdir -p "${build_dir}"
cp "${pbf_file}" "${build_dir}/turkmenistan-latest.osm.pbf"

echo "Building the OSRM driving graph..."
docker run --rm \
  --volume "${build_dir}:/data" \
  "${image}" \
  osrm-extract --profile /opt/car.lua /data/turkmenistan-latest.osm.pbf
docker run --rm \
  --volume "${build_dir}:/data" \
  "${image}" \
  osrm-partition /data/turkmenistan-latest.osrm
docker run --rm \
  --volume "${build_dir}:/data" \
  "${image}" \
  osrm-customize /data/turkmenistan-latest.osrm

printf '%s\n' "${source_sha}" > "${build_dir}/.source.sha256"
if [[ -d "${previous_dir}" ]]; then
  rm -rf "${previous_dir}"
fi
if [[ -d "${current_dir}" ]]; then
  mv "${current_dir}" "${previous_dir}"
fi
mv "${build_dir}" "${current_dir}"
if [[ -d "${previous_dir}" ]]; then
  rm -rf "${previous_dir}"
fi
trap - EXIT
echo "OSRM routing data is ready."
