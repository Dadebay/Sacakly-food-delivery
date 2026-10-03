#!/bin/sh
set -eu

deployment_dir=/opt/alowalow/production
tls_dir="$deployment_dir/redis-tls"
maps_runtime_dir="$deployment_dir/maps-runtime"
routing_runtime_dir="$deployment_dir/routing-runtime/current"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this one-time preparation script with sudo." >&2
  exit 1
fi

deploy_user=${SUDO_USER:-ubuntu}
case "$deploy_user" in
  ""|*[!A-Za-z0-9_-]*)
    echo "Unsafe deploy user name." >&2
    exit 1
    ;;
esac
id "$deploy_user" >/dev/null 2>&1

install -d -m 750 -o "$deploy_user" -g "$deploy_user" /opt/alowalow
install -d -m 750 -o "$deploy_user" -g "$deploy_user" "$deployment_dir"
install -d -m 750 -o "$deploy_user" -g "$deploy_user" "$tls_dir"
install -d -m 755 -o "$deploy_user" -g "$deploy_user" "$maps_runtime_dir"
install -d -m 755 -o "$deploy_user" -g "$deploy_user" "$routing_runtime_dir"

if [ ! -s "$tls_dir/ca.crt" ] || [ ! -s "$tls_dir/redis.crt" ] || [ ! -s "$tls_dir/redis.key" ]; then
  umask 077
  openssl genrsa -out "$tls_dir/ca.key" 3072
  openssl req \
    -x509 \
    -new \
    -key "$tls_dir/ca.key" \
    -sha256 \
    -days 825 \
    -subj "/CN=A7-tagam Production Redis CA" \
    -out "$tls_dir/ca.crt"
  openssl genrsa -out "$tls_dir/redis.key" 3072
  openssl req \
    -new \
    -key "$tls_dir/redis.key" \
    -subj "/CN=redis" \
    -out "$tls_dir/redis.csr"
  openssl x509 \
    -req \
    -in "$tls_dir/redis.csr" \
    -CA "$tls_dir/ca.crt" \
    -CAkey "$tls_dir/ca.key" \
    -CAcreateserial \
    -out "$tls_dir/redis.crt" \
    -days 825 \
    -sha256 \
    -extfile /dev/stdin <<'EOF'
subjectAltName=DNS:redis
extendedKeyUsage=serverAuth
keyUsage=digitalSignature,keyEncipherment
EOF
fi

chown -R "$deploy_user:$deploy_user" "$deployment_dir"
chmod 750 "$tls_dir"
chmod 444 "$tls_dir/ca.crt" "$tls_dir/redis.crt" "$tls_dir/redis.key"
chmod 600 "$tls_dir/ca.key"
find "$tls_dir" -type f \( -name '*.csr' -o -name '*.srl' \) -delete

printf '%s\n' 'vm.overcommit_memory = 1' > /etc/sysctl.d/60-alowalow-redis.conf
sysctl --system >/dev/null

# Persistent production data is intentionally external to Compose. This keeps
# ordinary stack replacement and even an accidental `compose down --volumes`
# from deleting PostgreSQL, media or the Nominatim index.
for volume in \
  alowalow-production_postgres_data \
  alowalow-production_minio_data \
  alowalow-production_nominatim_data
do
  docker volume inspect "$volume" >/dev/null 2>&1 || docker volume create "$volume" >/dev/null
done

echo "Prepared isolated production directory: $deployment_dir"
