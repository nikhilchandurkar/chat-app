# Production AWS EC2 Deployment Guide

## 1. Architecture & Capacity Planning

For a high-availability production deployment handling thousands of concurrent real-time WebSocket connections:

- **EC2 Instance**: `t3.medium` (2 vCPU, 4GB RAM) for development/pilot; `t3.large` or `c6i.large` (2 vCPU, 8GB RAM) for high-traffic production.
- **Operating System**: Ubuntu 22.04 or 24.04 LTS x86_64.
- **Storage**:
  - Root Volume: 30GB gp3 SSD (OS, logs, runtime).
  - Dedicated EBS Volume: 100GB+ gp3 SSD mounted at `/var/chat_storage/private`, encrypted with AWS KMS.
- **Domain & DNS**: Point your domain `chat.yourdomain.com` (A record) to the EC2 Elastic IP.

---

## 2. Server Provisioning & Package Installation

SSH into your clean EC2 instance:

```bash
ssh -i /path/to/key.pem ubuntu@<EC2_ELASTIC_IP>

# Update base system
sudo apt-get update && sudo apt-get upgrade -y

# Install Core Runtimes & Dependencies
sudo apt-get install -y python3-pip python3-venv python3-dev \
    mysql-server redis-server nginx certbot python3-certbot-nginx \
    libmagic1 build-essential git curl rsync ufw
```

---

## 3. Storage Mounting & Directory Permissions

Ensure your dedicated EBS volume is formatted (e.g., ext4) and mounted:

```bash
sudo mkdir -p /var/chat_storage/private
sudo chown -R www-data:www-data /var/chat_storage
sudo chmod -R 770 /var/chat_storage
```

---

## 4. MySQL 8+ Database Setup

Log in to MySQL as root:

```bash
sudo mysql
```

Execute the database provisioning script:

```sql
CREATE DATABASE chat_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'chat_user'@'localhost' IDENTIFIED WITH caching_sha2_password BY 'YourStrongRandomPasswordHere!';
GRANT ALL PRIVILEGES ON chat_db.* TO 'chat_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## 5. Redis 7+ Cache & Broker Configuration

Edit `/etc/redis/redis.conf`:
```conf
maxmemory 512mb
maxmemory-policy allkeys-lru
save ""
```
Restart and enable Redis:
```bash
sudo systemctl restart redis-server
sudo systemctl enable redis-server
```

---

## 6. Code Deployment & Environment Configuration

### Step 6.1: Clone Repository
```bash
sudo mkdir -p /var/www/chat-app
sudo chown -R ubuntu:ubuntu /var/www/chat-app
cd /var/www/chat-app
git clone <repository-url> .
```

### Step 6.2: Set Up Python Virtual Environment
```bash
cd /var/www/chat-app/django_server
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install gunicorn daphne
```

### Step 6.3: Production Environment File
Create `/var/www/chat-app/django_server/.env`:
```dotenv
DJANGO_DEBUG=False
DJANGO_SECRET_KEY=your_generated_64_character_crypto_secret_key
DJANGO_ALLOWED_HOSTS=chat.yourdomain.com,127.0.0.1
PUBLIC_DOMAIN=yourdomain.com
API_BASE_URL=https://chat.yourdomain.com
WEBSOCKET_URL=wss://chat.yourdomain.com/ws/chat/

DATABASE_ENGINE=django.db.backends.mysql
DATABASE_NAME=chat_db
DATABASE_USER=chat_user
DATABASE_PASSWORD=YourStrongRandomPasswordHere!
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306

USE_REDIS=True
REDIS_URL=redis://127.0.0.1:6379/0

STORAGE_ROOT=/var/chat_storage/private

EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USE_TLS=True
SMTP_USERNAME=your_ses_smtp_user
SMTP_PASSWORD=your_ses_smtp_password
DEFAULT_FROM_EMAIL="Secure Chat" <notifications@yourdomain.com>
```

### Step 6.4: Run Migrations & Collect Static Files
```bash
python manage.py migrate
python manage.py collectstatic --noinput
```

---

## 7. Web Application Build (React 18)

Install Node.js 20 LTS:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Build client bundle:
```bash
cd /var/www/chat-app/client
cat <<EOF > .env.production
VITE_API_BASE_URL=https://chat.yourdomain.com
VITE_WS_URL=wss://chat.yourdomain.com/ws/chat/
EOF

npm ci
npm run build
```

---

## 8. Systemd Service Units Configuration

Copy provided service units to `/etc/systemd/system/`:

```bash
sudo cp /var/www/chat-app/deploy/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
```

Enable and start services:
```bash
# Daphne ASGI Server (Port 8000)
sudo systemctl enable --now chat-asgi

# Transactional Outbox Worker
sudo systemctl enable --now chat-outbox

# Celery Worker & Beat (Background Tasks & Purging)
sudo systemctl enable --now chat-celery
sudo systemctl enable --now chat-celery-beat
```

Check status:
```bash
sudo systemctl status chat-asgi
```

---

## 9. Nginx & SSL Configuration (Certbot Let's Encrypt)

Copy Nginx configuration:
```bash
sudo cp /var/www/chat-app/nginx.conf /etc/nginx/sites-available/chat-app
sudo ln -sf /etc/nginx/sites-available/chat-app /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
```

Obtain TLS Certificate:
```bash
sudo certbot --nginx -d chat.yourdomain.com --non-interactive --agree-tos -m admin@yourdomain.com
```

Test and reload Nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 10. Firewall Configuration (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw enable
```

