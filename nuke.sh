#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Stopping containers..."
podman compose down 2>/dev/null || true

echo "Removing volumes..."
podman volume rm slopsmith-plus_postgres-data slopsmith-plus_minio-data slopsmith-plus_rocksmith-config slopsmith_rocksmith-config slopsmith-config 2>/dev/null || true

echo "Done. All data wiped."