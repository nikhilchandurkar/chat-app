#!/usr/bin/env bash
# ==============================================================================
# Production Deployment Script for AWS EC2 Ubuntu LTS
# ==============================================================================
set -euo pipefail

APP_DIR="/srv/chatapp"
DJANGO_DIR="${APP_DIR}/django_server"
CLIENT_DIR="${APP_DIR}/client"

echo "[+] Starting ChatApp Production Deployment: $(date)"

# 1. Pull latest verified commit
cd "${APP_DIR}"
git fetch origin main
git checkout main
git pull origin main

# 2. Update Python Virtual Environment Dependencies
cd "${DJANGO_DIR}"
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# 3. Database Migrations
echo "[+] Running database migrations..."
python manage.py migrate --noinput

# 4. Collect Static Files
echo "[+] Collecting backend static files..."
python manage.py collectstatic --noinput

# 5. Build React Web Application
echo "[+] Building React production frontend..."
cd "${CLIENT_DIR}"
npm ci
npm run build

# Copy build to Nginx serving webroot
sudo cp -r dist/* /var/www/chatapp/

# 6. Restart Backend Services
echo "[+] Restarting ASGI and Worker services..."
sudo systemctl restart chat-asgi
sudo systemctl restart chat-outbox
sudo systemctl restart chat-celery
sudo systemctl restart chat-celery-beat
sudo systemctl reload nginx

# 7. Post-Deployment Verification Health Check
echo "[+] Verifying application readiness probe..."
sleep 3
HEALTH_STATUS=$(curl -sSf http://127.0.0.1:8000/api/v1/ready | grep '"status": "ready"' || true)

if [ -z "${HEALTH_STATUS}" ]; then
  echo "[-] ERROR: Readiness check failed after deployment! Check journalctl -u chat-asgi"
  exit 1
fi

echo "[✓] Deployment completed successfully: $(date)"

