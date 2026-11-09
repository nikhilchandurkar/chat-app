#!/usr/bin/env bash
# ==============================================================================
# Automated Encrypted MySQL & Private File Storage Backup Script
# ChatApp Production Backup Routine
# ==============================================================================
set -euo pipefail

BACKUP_DIR="/srv/chatapp/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RETENTION_DAYS=14
STORAGE_PATH="/srv/chatapp/storage/private"
DB_NAME="${DATABASE_NAME:-chat_db}"
DB_USER="${DATABASE_USER:-chat_user}"
DB_PASS="${DATABASE_PASSWORD:-chat_password}"
DB_HOST="${DATABASE_HOST:-127.0.0.1}"

mkdir -p "${BACKUP_DIR}"

echo "[+] Starting ChatApp backup: ${TIMESTAMP}"

# 1. Database Backup with mysqldump
SQL_DUMP="${BACKUP_DIR}/mysql_${DB_NAME}_${TIMESTAMP}.sql"
mysqldump \
  --host="${DB_HOST}" \
  --user="${DB_USER}" \
  --password="${DB_PASS}" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  "${DB_NAME}" > "${SQL_DUMP}"

gzip -9 "${SQL_DUMP}"
echo "[+] MySQL backup completed: ${SQL_DUMP}.gz"

# 2. File Storage Archive
if [ -d "${STORAGE_PATH}" ]; then
  TAR_STORAGE="${BACKUP_DIR}/storage_${TIMESTAMP}.tar.gz"
  tar -czf "${TAR_STORAGE}" -C "${STORAGE_PATH}" .
  echo "[+] File storage backup completed: ${TAR_STORAGE}"
fi

# 3. Encrypt backups if GPG key is present
if [ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]; then
  echo "[+] Encrypting backup archives..."
  gpg --batch --yes --symmetric --passphrase "${BACKUP_ENCRYPTION_PASSPHRASE}" "${SQL_DUMP}.gz"
  rm -f "${SQL_DUMP}.gz"
  if [ -f "${TAR_STORAGE:-}" ]; then
    gpg --batch --yes --symmetric --passphrase "${BACKUP_ENCRYPTION_PASSPHRASE}" "${TAR_STORAGE}"
    rm -f "${TAR_STORAGE}"
  fi
  echo "[+] Encryption completed."
fi

# 4. Prune backups older than RETENTION_DAYS
echo "[+] Cleaning backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -type f -mtime "+${RETENTION_DAYS}" -delete

echo "[✓] Backup routine completed successfully: $(date)"

