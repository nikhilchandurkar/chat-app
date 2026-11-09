#!/usr/bin/env bash
# ==============================================================================
# deploy_server.sh — Complete Server-Side Stack Setup for Chat App
# Starts: MySQL 8 + Redis 7 + Daphne ASGI (port 3000) + Celery Worker
# ==============================================================================
set -e

echo "=========================================================="
echo "🚀 Starting Full Server-Side Setup (MySQL, Redis, Celery, Daphne)"
echo "=========================================================="

# 1. Directories
echo "📁 [1/6] Creating deployment directories..."
sudo mkdir -p /opt/chat-app/{frontend,mysql_data,redis_data,media,logs} /var/www/certbot
sudo chown -R $USER:$USER /opt/chat-app
sudo chmod -R 775 /opt/chat-app
sudo chmod -R 777 /opt/chat-app/logs /opt/chat-app/media
echo "✅ Directories ready at /opt/chat-app"

# 2. MySQL 8.0
echo "🐬 [2/6] Starting MySQL 8 container..."
sudo chown -R 999:999 /opt/chat-app/mysql_data 2>/dev/null || true
docker stop chat_mysql 2>/dev/null || true
docker rm chat_mysql 2>/dev/null || true

docker run -d \
  --name chat_mysql \
  --restart unless-stopped \
  -e MYSQL_DATABASE=chat_db \
  -e MYSQL_USER=chat_user \
  -e MYSQL_PASSWORD=chat_password \
  -e MYSQL_ROOT_PASSWORD=chat_root_password \
  -v /opt/chat-app/mysql_data:/var/lib/mysql \
  -p 127.0.0.1:3306:3306 \
  mysql:8.0 \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_unicode_ci \
  --default-authentication-plugin=mysql_native_password \
  --innodb-buffer-pool-size=128M \
  --max-connections=50

echo "⏳ Waiting for MySQL to initialize..."
for i in {1..20}; do
  if docker exec chat_mysql mysqladmin ping -uchat_user -pchat_password --silent 2>/dev/null; then
    echo "✅ MySQL is ready!"
    break
  fi
  sleep 3
done

# Grant MySQL user privileges
docker exec chat_mysql mysql -uroot -pchat_root_password -e "
  CREATE DATABASE IF NOT EXISTS chat_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER IF NOT EXISTS 'chat_user'@'%' IDENTIFIED WITH mysql_native_password BY 'chat_password';
  ALTER USER 'chat_user'@'%' IDENTIFIED WITH mysql_native_password BY 'chat_password';
  GRANT ALL PRIVILEGES ON chat_db.* TO 'chat_user'@'%';
  FLUSH PRIVILEGES;
" 2>/dev/null || true

# 3. Redis 7
echo "🔴 [3/6] Starting Redis 7 container..."
docker stop chat_redis 2>/dev/null || true
docker rm chat_redis 2>/dev/null || true

docker run -d \
  --name chat_redis \
  --restart unless-stopped \
  -p 127.0.0.1:6379:6379 \
  -v /opt/chat-app/redis_data:/data \
  redis:7-alpine \
  redis-server --appendonly yes --maxmemory 64mb --maxmemory-policy allkeys-lru

sleep 2
docker exec chat_redis redis-cli ping

# 4. Pull latest image
echo "📦 [4/6] Pulling latest Django Docker image..."
DOCKER_IMG="nikhil2523/chat-app:latest"
docker pull nikhil2523/chat-app:latest 2>/dev/null || docker pull nikhil2523/chat-app-django:latest || true
if ! docker image inspect nikhil2523/chat-app:latest >/dev/null 2>&1; then
  DOCKER_IMG="nikhil2523/chat-app-django:latest"
fi

# 5. Daphne ASGI Server (Port 3000)
echo "⚡ [5/6] Starting Daphne ASGI Server..."
docker stop chat_django_daphne 2>/dev/null || true
docker rm chat_django_daphne 2>/dev/null || true

docker run -d \
  --name chat_django_daphne \
  --restart unless-stopped \
  --network host \
  -e PORT=3000 \
  -e DEBUG=False \
  -e SECRET_KEY='django-insecure-chat-prod-2026-secure-key-998811' \
  -e ADMIN_SECRET_KEY='chat_app_admin_secret' \
  -e DB_ENGINE=mysql \
  -e MYSQL_DATABASE=chat_db \
  -e MYSQL_USER=chat_user \
  -e MYSQL_PASSWORD=chat_password \
  -e MYSQL_HOST=127.0.0.1 \
  -e MYSQL_PORT=3306 \
  -e DB_CONN_MAX_AGE=600 \
  -e REDIS_URL='redis://127.0.0.1:6379/0' \
  -e USE_REDIS=True \
  -e CLIENT_URL='https://chat-nikkiii.duckdns.org' \
  -e ALLOWED_HOSTS='*' \
  -v /opt/chat-app/media:/app/media \
  -v /opt/chat-app/logs:/app/logs \
  "$DOCKER_IMG"

sleep 6
echo "Applying database migrations..."
docker exec chat_django_daphne python manage.py migrate --noinput || true

# 6. Celery Worker
echo "🔄 [6/6] Starting Celery Worker..."
docker stop chat_celery_worker 2>/dev/null || true
docker rm chat_celery_worker 2>/dev/null || true

docker run -d \
  --name chat_celery_worker \
  --restart unless-stopped \
  --network host \
  -e DEBUG=False \
  -e SECRET_KEY='django-insecure-chat-prod-2026-secure-key-998811' \
  -e DB_ENGINE=mysql \
  -e MYSQL_DATABASE=chat_db \
  -e MYSQL_USER=chat_user \
  -e MYSQL_PASSWORD=chat_password \
  -e MYSQL_HOST=127.0.0.1 \
  -e MYSQL_PORT=3306 \
  -e DB_CONN_MAX_AGE=600 \
  -e REDIS_URL='redis://127.0.0.1:6379/0' \
  -e USE_REDIS=True \
  -e CELERY_CONCURRENCY=2 \
  -v /opt/chat-app/media:/app/media \
  "$DOCKER_IMG" \
  celery -A core worker -l info --concurrency=2 --max-memory-per-child=150000

echo "=========================================================="
echo "🎉 Server Stack is UP & RUNNING!"
echo "=========================================================="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

