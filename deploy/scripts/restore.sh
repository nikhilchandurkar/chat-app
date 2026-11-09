#!/usr/bin/env bash
# ==============================================================================
# Disaster Recovery & Database Restoration Script
# ==============================================================================
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <path_to_backup_archive.sql.gz> [storage_archive.tar.gz]"
  exit 1
fi

SQL_ARCHIVE="$1"
STORAGE_ARCHIVE="${2:-}"

DB_NAME="${DATABASE_NAME:-chat_db}"
DB_USER="${DATABASE_USER:-chat_user}"
DB_PASS="${DATABASE_PASSWORD:-chat_password}"
DB_HOST="${DATABASE_HOST:-127.0.0.1}"
STORAGE_PATH="/srv/chatapp/storage/private"

echo "[!] WARNING: This will overwrite data in '${DB_NAME}'!"
read -p "Are you sure you want to proceed? (yes/no): " CONFIRM
if [ "${CONFIRM}" != "yes" ]; then
  echo "Restoration aborted."
  exit 0
fi

# Stop ASGI & worker services during restore
echo "[+] Stopping application services..."
sudo systemctl stop chat-asgi chat-outbox chat-celery chat-celery-beat || true

# Restore Database
echo "[+] Restoring MySQL database from ${SQL_ARCHIVE}..."
gunzip -c "${SQL_ARCHIVE}" | mysql \
  --host="${DB_HOST}" \
  --user="${DB_USER}" \
  --password="${DB_PASS}" \
  "${DB_NAME}"

# Restore Storage if provided
if [ -n "${STORAGE_ARCHIVE}" ] && [ -f "${STORAGE_ARCHIVE}" ]; then
  echo "[+] Restoring private storage files..."
  mkdir -p "${STORAGE_PATH}"
  tar -xzf "${STORAGE_ARCHIVE}" -C "${STORAGE_PATH}"
  chown -R ubuntu:ubuntu "${STORAGE_PATH}"
fi

# Restart services
echo "[+] Restarting application services..."
sudo systemctl start chat-asgi chat-outbox chat-celery chat-celery-beat

# Verify health probe
echo "[+] Verifying application health..."
curl -sSf http://127.0.0.1:8000/api/v1/health || (echo "Health check failed!" && exit 1)

echo "[✓] Restoration completed successfully."

