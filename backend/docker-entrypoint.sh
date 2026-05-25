#!/bin/sh
set -e

wait_for_tcp() {
  host="$1" port="$2"
  node -e "
    const net = require('net');
    const s = net.connect($port, '$host');
    s.on('connect', () => { s.destroy(); process.exit(0); });
    s.on('error',   () => process.exit(1));
  " 2>/dev/null
}

echo "Waiting for database at ${DB_HOST:-db}:${DB_PORT:-5432}..."
until wait_for_tcp "${DB_HOST:-db}" "${DB_PORT:-5432}"; do
  echo "Database not ready, retrying in 2s..."
  sleep 2
done
echo "Database is ready."

echo "Waiting for MinIO at ${MINIO_ENDPOINT:-minio}:${MINIO_PORT:-9000}..."
until wait_for_tcp "${MINIO_ENDPOINT:-minio}" "${MINIO_PORT:-9000}"; do
  echo "MinIO not ready, retrying in 2s..."
  sleep 2
done
echo "MinIO is ready."

echo "Running prisma db push..."
npx prisma db push --skip-generate

echo "Starting server..."
exec node dist/index.js
