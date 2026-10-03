#!/usr/bin/env bash
set -euo pipefail

maps_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
runtime_dir="${maps_dir}/runtime"
downloads_dir="${runtime_dir}/downloads"
staging_dir="${runtime_dir}/.staging"

tiles_url="https://download.geofabrik.de/asia/turkmenistan-shortbread-1.0.mbtiles"
style_version="5.12.1"
style_variant="colorful"
fonts_version="2.2.0"
styles_sha256="b0624b37e0b45967b2f26d50afab93ff1657de652e9bbb6a1a522123b91a463c"
sprites_sha256="dc06637e0fbcd4b31f95a8b028c96480774d448ac32238790e3d29cdcc61ed80"
fonts_sha256="d6c67a0af67a6c6b7b5f12faf66ae302b0a43694750522b8a11384c53cd6c113"
style_url="https://github.com/versatiles-org/versatiles-style/releases/download/v${style_version}/styles.tar.gz"
sprites_url="https://github.com/versatiles-org/versatiles-style/releases/download/v${style_version}/sprites.tar.gz"
fonts_url="https://github.com/versatiles-org/versatiles-fonts/releases/download/v${fonts_version}/fonts.tar.gz"

refresh_tiles=false
if [[ "${1:-}" == "--refresh" ]]; then
  refresh_tiles=true
elif [[ -n "${1:-}" ]]; then
  echo "Unknown argument: $1" >&2
  echo "Usage: maps/prepare.sh [--refresh]" >&2
  exit 2
fi

for command_name in awk cp curl node od tar tr wc; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command is missing: ${command_name}" >&2
    exit 1
  fi
done

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    echo "Required command is missing: sha256sum or shasum" >&2
    return 1
  fi
}

verify_sha256() {
  local source="$1"
  local expected="$2"
  local actual

  actual="$(sha256_file "${source}")"
  if [[ "${actual}" != "${expected}" ]]; then
    echo "Checksum mismatch for ${source}" >&2
    echo "Expected ${expected}, received ${actual}" >&2
    return 1
  fi
}

mkdir -p \
  "${downloads_dir}" \
  "${runtime_dir}/data" \
  "${runtime_dir}/fonts" \
  "${runtime_dir}/sprites" \
  "${runtime_dir}/styles"

download() {
  local url="$1"
  local destination="$2"
  local temporary="${destination}.part"

  if [[ -s "${destination}" ]]; then
    return
  fi

  echo "Downloading ${url}"
  curl \
    --fail \
    --location \
    --retry 5 \
    --retry-all-errors \
    --retry-delay 2 \
    --continue-at - \
    --output "${temporary}" \
    "${url}"
  mv "${temporary}" "${destination}"
}

verify_mbtiles() {
  local source="$1"
  local header
  local size

  size="$(wc -c < "${source}" | tr -d '[:space:]')"
  header="$(od -An -tx1 -N16 "${source}" | tr -d '[:space:]')"

  if (( size < 1000000 )); then
    echo "Downloaded MBTiles file is unexpectedly small: ${size} bytes" >&2
    return 1
  fi

  if [[ "${header}" != "53514c69746520666f726d6174203300" ]]; then
    echo "Downloaded map is not an SQLite/MBTiles file" >&2
    return 1
  fi
}

tiles_path="${runtime_dir}/data/turkmenistan.mbtiles"
if [[ "${refresh_tiles}" == true ]]; then
  next_tiles="${tiles_path}.next"
  rm -f "${next_tiles}"
  download "${tiles_url}" "${next_tiles}"
  verify_mbtiles "${next_tiles}"
  mv "${next_tiles}" "${tiles_path}"
elif [[ ! -s "${tiles_path}" ]]; then
  download "${tiles_url}" "${tiles_path}"
fi
verify_mbtiles "${tiles_path}"

styles_archive="${downloads_dir}/versatiles-styles-v${style_version}.tar.gz"
sprites_archive="${downloads_dir}/versatiles-sprites-v${style_version}.tar.gz"
fonts_archive="${downloads_dir}/versatiles-fonts-v${fonts_version}.tar.gz"
style_marker="${runtime_dir}/.style-${style_variant}-v${style_version}.ready"
shared_assets_marker="${runtime_dir}/.assets-sprites-v${style_version}-fonts-v${fonts_version}.ready"
legacy_assets_marker="${runtime_dir}/.assets-style-v${style_version}-fonts-v${fonts_version}.ready"

if [[ \
  ! -f "${shared_assets_marker}" && \
  -f "${legacy_assets_marker}" && \
  -d "${runtime_dir}/fonts/noto_sans_regular" && \
  -d "${runtime_dir}/fonts/noto_sans_bold" && \
  -d "${runtime_dir}/sprites/basics" \
]]; then
  touch "${shared_assets_marker}"
fi

if [[ ! -f "${style_marker}" ]]; then
  download "${style_url}" "${styles_archive}"
  verify_sha256 "${styles_archive}" "${styles_sha256}"

  rm -rf "${staging_dir}"
  mkdir -p "${staging_dir}/styles"

  tar -xzf \
    "${styles_archive}" \
    -C "${staging_dir}/styles" \
    "${style_variant}/style.json"
  node \
    "${maps_dir}/patch-style.mjs" \
    "${staging_dir}/styles/${style_variant}/style.json" \
    "${staging_dir}/styles/alowalow.json"

  mv "${staging_dir}/styles/alowalow.json" "${runtime_dir}/styles/alowalow.json"
  rm -rf "${staging_dir}"
  rm -f "${styles_archive}"
  touch "${style_marker}"
fi

if [[ ! -f "${shared_assets_marker}" ]]; then
  download "${sprites_url}" "${sprites_archive}"
  download "${fonts_url}" "${fonts_archive}"
  verify_sha256 "${sprites_archive}" "${sprites_sha256}"
  verify_sha256 "${fonts_archive}" "${fonts_sha256}"

  rm -rf "${staging_dir}"
  mkdir -p "${staging_dir}/sprites" "${staging_dir}/fonts"

  tar -xzf "${sprites_archive}" -C "${staging_dir}/sprites" basics

  glyph_ranges=(
    0-255
    256-511
    512-767
    768-1023
    1024-1279
    1280-1535
    1536-1791
    8192-8447
    8448-8703
    64256-64511
    65024-65279
    65280-65535
  )
  font_files=()
  for font_name in noto_sans_regular noto_sans_bold; do
    for glyph_range in "${glyph_ranges[@]}"; do
      font_files+=("${font_name}/${glyph_range}.pbf")
    done
  done
  tar -xzf "${fonts_archive}" -C "${staging_dir}/fonts" "${font_files[@]}"

  rm -rf \
    "${runtime_dir}/fonts/noto_sans_regular" \
    "${runtime_dir}/fonts/noto_sans_bold" \
    "${runtime_dir}/sprites/basics"
  mv "${staging_dir}/fonts/noto_sans_regular" "${runtime_dir}/fonts/"
  mv "${staging_dir}/fonts/noto_sans_bold" "${runtime_dir}/fonts/"
  mv "${staging_dir}/sprites/basics" "${runtime_dir}/sprites/"
  rm -rf "${staging_dir}"
  rm -f "${sprites_archive}" "${fonts_archive}"
  touch "${shared_assets_marker}"
fi

cp "${maps_dir}/config.json" "${runtime_dir}/config.json"

echo "OpenStreetMap assets are ready in ${runtime_dir}"
echo "Raster XYZ: http://127.0.0.1:${MAP_PORT:-8080}/styles/alowalow/{z}/{x}/{y}.png"
