#!/usr/bin/env sh
# Generate a self-signed P12 keypair for dev/test PAdES signing.
#
# Requires openssl on PATH. Writes two files:
#   - <out>/seald-dev.key      (RSA private key, cleartext)
#   - <out>/seald-dev.crt      (self-signed X.509 cert, 10yr validity)
#   - <out>/seald-dev.p12      (PKCS#12 bundle combining the above)
#
# Usage:
#   OUT=./secrets PASS=devpass ./scripts/generate-dev-p12.sh
#
# Defaults to OUT=./secrets and PASS=devpass if unset. NEVER commit the
# generated .p12 or the password — both are dev-only.

set -eu

OUT="${OUT:-./secrets}"
PASS="${PASS:-devpass}"

mkdir -p "$OUT"

if [ -f "$OUT/seald-dev.p12" ]; then
  echo "generate-dev-p12: $OUT/seald-dev.p12 already exists, skipping"
  exit 0
fi

echo "generate-dev-p12: writing keypair + P12 to $OUT (password=$PASS)"

openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout "$OUT/seald-dev.key" \
  -out    "$OUT/seald-dev.crt" \
  -subj   "/C=US/ST=CA/L=SF/O=Seald Dev/CN=seald-dev"

openssl pkcs12 -export \
  -inkey  "$OUT/seald-dev.key" \
  -in     "$OUT/seald-dev.crt" \
  -out    "$OUT/seald-dev.p12" \
  -name   "seald-dev" \
  -passout "pass:$PASS"

echo "generate-dev-p12: done"
echo ""
echo "Set these in apps/api/.env:"
echo "  PDF_SIGNING_PROVIDER=local"
echo "  PDF_SIGNING_LOCAL_P12_PATH=$(cd "$OUT" && pwd)/seald-dev.p12"
echo "  PDF_SIGNING_LOCAL_P12_PASS=$PASS"
