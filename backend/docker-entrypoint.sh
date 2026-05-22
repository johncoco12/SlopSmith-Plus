#!/bin/sh
set -e

echo "Waiting for database at ${DB_HOST:-db}:${DB_PORT:-5432}..."
until nc -z "${DB_HOST:-db}" "${DB_PORT:-5432}" 2>/dev/null; do
  echo "Database not ready, retrying in 2s..."
  sleep 2
done
echo "Database is ready."

echo "Waiting for MinIO at ${MINIO_ENDPOINT:-minio}:${MINIO_PORT:-9000}..."
until nc -z "${MINIO_ENDPOINT:-minio}" "${MINIO_PORT:-9000}" 2>/dev/null; do
  echo "MinIO not ready, retrying in 2s..."
  sleep 2
done
echo "MinIO is ready."

echo "Running prisma db push..."
npx prisma db push --skip-generate

echo "Starting server..."
exec node dist/index.js