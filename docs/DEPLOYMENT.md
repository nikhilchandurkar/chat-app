# Deployment

## Localhost Development

### Requirements

- Python 3.12+
- Node.js 20+
- PostgreSQL 15+ or MySQL 8+ (or use `DB_ENGINE=sqlite3` for zero-setup)
- Redis 7+ (optional – set `USE_REDIS=False` to skip)

### Backend Setup

```bash
cd django_server

# 1. Create and activate virtual environment
python -m venv venv
# Windows
venv\Scripts\activate
# Linux / macOS
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env – set DATABASE_URL, SECRET_KEY, etc.

# 4. Run migrations
python manage.py migrate

# 5. Create superuser (optional)
python manage.py createsuperuser

# 6. Start development server
python manage.py runserver 8000
# OR with Daphne (ASGI):
daphne -p 8000 core.asgi:application
```

### Frontend Setup

```bash
cd client
npm install
cp ../.env.example .env  # or just create client/.env
# Set VITE_SERVER=http://localhost:8000
npm run dev
# Opens at http://localhost:5173
```

### Start Celery Worker (optional, for email features)

Requires Redis running (`USE_REDIS=True`).

```bash
cd django_server
celery -A core worker -l info --concurrency=2
```

---

## Docker Compose (Recommended for Production)

```bash
cd django_server
cp .env.example .env
# Edit .env: set strong SECRET_KEY, real DATABASE_URL, EMAIL_*, etc.

docker compose up -d
```

This starts:
- `chat_postgres` – PostgreSQL 16
- `chat_redis` – Redis 7
- `chat_django_daphne` – Django ASGI server on port 8000
- `chat_celery_worker` – Celery email worker

---

## Server Deployment (EC2 / VPS)

### Automated via GitHub Actions

Push to `main` triggers the CI/CD pipeline which:

1. Runs backend tests and security scans
2. Builds the React SPA on GitHub cloud runners
3. Builds and pushes the Django Docker image to Docker Hub
4. SSH's to the EC2 self-hosted runner to deploy

Required GitHub Secrets:

| Secret | Description |
|--------|-------------|
| `DOCKER_PASSWORD` | Docker Hub password |
| `DJANGO_SECRET_KEY` | Django secret key (50+ chars) |
| `ADMIN_SECRET_KEY` | Admin panel secret |
| `DATABASE_URL` | PostgreSQL connection URL |
| `MESSAGE_ENCRYPTION_KEY` | 32-character AES key |
| `CLIENT_URL` | Frontend URL (e.g., `https://yourdomain.com`) |
| `EMAIL_USER` | SMTP email address |
| `EMAIL_PASS` | SMTP app password |
| `SONAR_TOKEN` | SonarCloud token (optional) |
| `ALLOWED_HOSTS` | Comma/space-separated allowed hosts |

### Manual Server Setup

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Nginx
sudo apt install nginx -y

# Configure Nginx (copy from repo)
sudo cp nginx.conf /etc/nginx/sites-available/chatapp
sudo ln -sf /etc/nginx/sites-available/chatapp /etc/nginx/sites-enabled/chatapp
sudo nginx -t && sudo systemctl reload nginx

# Setup directories
sudo mkdir -p /opt/chat-app/{frontend,redis_data,media,logs}
sudo chown -R $USER:$USER /opt/chat-app
```

---

## Environment Variable Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `DEBUG` | `True` | Set to `False` in production |
| `SECRET_KEY` | (insecure default) | Django secret key – **must be changed** |
| `ADMIN_SECRET_KEY` | `chat_app_secret` | Admin panel verification key |
| `PORT` | `8000` | Daphne listen port |
| `ALLOWED_HOSTS` | `*` | Space-separated allowed host names |
| `CLIENT_URL` | `http://localhost:5173` | Frontend origin for CORS |
| `DB_ENGINE` | `postgresql` | `postgresql` / `mysql` / `sqlite3` |
| `DATABASE_URL` | PostgreSQL localhost | Full DB connection URL |
| `MYSQL_*` | – | MySQL connection settings (when `DB_ENGINE=mysql`) |
| `USE_REDIS` | `False` | Enable Redis for Channels + cache |
| `REDIS_URL` | `redis://127.0.0.1:6379/0` | Redis connection URL |
| `MESSAGE_ENCRYPTION_KEY` | (insecure default) | 32-char AES-256 key |
| `EMAIL_HOST` | `smtp.gmail.com` | SMTP server |
| `EMAIL_PORT` | `587` | SMTP port |
| `EMAIL_USER` | – | SMTP username |
| `EMAIL_PASS` | – | SMTP app password |
| `CELERY_CONCURRENCY` | `2` | Celery worker processes |
| `LOGIN_RATE_LIMIT` | `5` | Login attempts per minute |
| `OTP_RATE_LIMIT` | `3` | OTP requests per minute |

---

## Configuring for a Server IP Address or Domain

The application has no hardcoded server addresses. To deploy to a new server:

1. Set `CLIENT_URL=https://yourdomain.com` in `.env`
2. Set `ALLOWED_HOSTS=yourdomain.com` in `.env`
3. Set `VITE_SERVER=https://yourdomain.com` in `client/.env`
4. Update your DNS or set the IP in Nginx `server_name`
5. Run `certbot --nginx -d yourdomain.com` for SSL certificates

No code changes are required.

---

## Upgrading WSL on the Self-Hosted Runner

If the GitHub Actions self-hosted runner is on Windows with WSL:

```bash
# Update WSL
wsl --update

# Clean up Docker resources after WSL update
docker system prune -f
docker container prune -f
docker image prune -f

# Verify Docker is working
docker ps
docker run --rm hello-world
```
