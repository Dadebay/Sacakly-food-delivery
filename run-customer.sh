#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$repo_dir"

usage() {
  echo "Uygulama klasöründe: ./run.sh [android-cihaz-id]"
  echo "Depo kökünde: ./run-customer.sh [android-cihaz-id]"
  echo "Bağlı cihazları görmek için: adb devices"
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi
if (( $# > 1 )); then
  usage >&2
  exit 2
fi

for command_name in adb awk curl docker flutter grep node npm pkill; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Gerekli komut bulunamadı: $command_name" >&2
    exit 1
  fi
done
if [[ ! -f apps/api/.env ]]; then
  echo "apps/api/.env bulunamadı. Önce apps/api/.env.example dosyasından yerel ayarları oluşturun." >&2
  exit 1
fi
if [[ ! -x apps/api/node_modules/.bin/nest ]]; then
  echo "API bağımlılıkları eksik. Önce npm ci --prefix apps/api çalıştırın." >&2
  exit 1
fi

# This command applies migrations and demo data, so only the isolated local
# database is accepted. Node reads .env without executing it as shell code.
node --env-file=apps/api/.env -e '
  const url = new URL(process.env.DATABASE_URL || "");
  if (process.env.NODE_ENV === "production" ||
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.port !== "5432" || url.pathname !== "/sacakly") {
    console.error("Yalnızca yerel sacakly veritabanı ile çalıştırılabilir.");
    process.exit(1);
  }
'

connected_devices="$(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
device_id="${1:-}"
if [[ -z "$device_id" ]]; then
  if [[ -z "$connected_devices" ]]; then
    echo "Bağlı Android cihaz bulunamadı. USB hata ayıklamayı açıp adb devices ile kontrol edin." >&2
    exit 1
  fi
  if [[ "$connected_devices" == *$'\n'* ]]; then
    echo "Birden fazla Android cihaz bağlı. Kullanılacak cihaz ID'sini belirtin:" >&2
    printf '%s\n' "$connected_devices" >&2
    exit 1
  fi
  device_id="$connected_devices"
fi
if ! printf '%s\n' "$connected_devices" | grep -Fxq -- "$device_id"; then
  echo "Android cihaz bağlı değil veya yetkilendirilmemiş: $device_id" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  if [[ "$(uname -s)" == "Darwin" ]]; then
    echo "Docker Desktop başlatılıyor..."
    open -a Docker
  else
    echo "Docker servisini başlatın ve komutu tekrar çalıştırın." >&2
    exit 1
  fi
  for ((attempt = 0; attempt < 90; attempt++)); do
    if docker info >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  if ! docker info >/dev/null 2>&1; then
    echo "Docker Desktop hazır olmadı." >&2
    exit 1
  fi
fi

echo "Yerel veritabanı, Redis ve MinIO hazırlanıyor..."
docker compose up -d --wait postgres redis minio
npm --prefix apps/api run db:deploy
node --env-file=apps/api/.env apps/api/scripts/init-local-s3.mjs
cafe_count="$(docker compose exec -T postgres psql -U sacakly -d sacakly -tAc 'SELECT COUNT(*) FROM "Cafe"')"
if [[ "$cafe_count" == "0" ]]; then
  echo "Boş yerel veritabanına örnek menü ekleniyor..."
  npm run demo:seed
fi

echo "Yerel harita servisi hazırlanıyor..."
npm run maps:up

api_pid=""
stop_started_api() {
  if [[ -n "$api_pid" ]]; then
    pkill -TERM -P "$api_pid" 2>/dev/null || true
    kill "$api_pid" 2>/dev/null || true
    wait "$api_pid" 2>/dev/null || true
  fi
}
trap stop_started_api EXIT

api_ready() {
  curl -fsS --max-time 2 http://127.0.0.1:4000/api/v1/health 2>/dev/null \
    | grep -Fq '"service":"sacakly-api"'
}

if api_ready; then
  echo "Çalışan Saçakly API kullanılıyor."
else
  echo "Saçakly API başlatılıyor..."
  npm run dev:api &
  api_pid=$!
  for ((attempt = 0; attempt < 90; attempt++)); do
    if api_ready; then
      break
    fi
    if ! kill -0 "$api_pid" 2>/dev/null; then
      echo "API başlamadan kapandı." >&2
      exit 1
    fi
    sleep 1
  done
  if ! api_ready; then
    echo "API 90 saniye içinde hazır olmadı. 4000 portunu ve API çıktısını kontrol edin." >&2
    exit 1
  fi
fi

echo "Android cihazında API ve harita portları bağlanıyor: $device_id"
adb -s "$device_id" reverse tcp:4000 tcp:4000
adb -s "$device_id" reverse tcp:8080 tcp:8080

echo "Flutter debug modunda başlatılıyor (hot reload için r)."
cd apps/customer
flutter run -d "$device_id" --debug \
  --dart-define=API_BASE_URL=http://127.0.0.1:4000/api/v1/ \
  '--dart-define=MAP_TILE_URL=http://127.0.0.1:8080/styles/sacakly/{z}/{x}/{y}.png'
