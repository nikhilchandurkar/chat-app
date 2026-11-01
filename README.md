# 🚀 Production Chat App

A high-performance, real-time chat application powered by **Django ASGI (Daphne)**, **MySQL 8 (Single Server DB)**, **React 18 (Vite)**, and **Capacitor Android Mobile**.

---

## 🛠️ Complete Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Backend** | Python 3.12, Django 5.1, DRF | REST API + ASGI routing |
| **ASGI Server** | Daphne 4.1 | Handles HTTP & WebSockets on port `3000` |
| **Real-Time** | Django Channels 4.2 | Native WebSockets at `/ws` |
| **Database** | **MySQL 8.0 (Single Server DB)** | Container `chat_mysql`, internal port `3306`, persisted at `/opt/chat-app/mysql_data` |
| **Cache & Task Broker** | Redis 7 Alpine | Container `chat_redis`, internal port `6379`, persisted at `/opt/chat-app/redis_data` |
| **Task Queue** | Celery 5.4 | Container `chat_celery_worker` with memory controls |
| **Web & Proxy Server** | Nginx | Port `80` (HTTP) → Serves React static SPA + proxies API/WebSockets |
| **Frontend** | React 18, TypeScript, Vite 6 | Material-UI (MUI), Redux Toolkit, Framer Motion, Axios |
| **Mobile (Android)** | **Capacitor 6** | Wraps React SPA into native Android APK connecting to live server |
| **CI/CD** | GitHub Actions | 7-Stage pipeline (Lint, SAST, Dependency audit, Tests, Build, Scan, EC2 Deploy) |
| **Security** | Bandit, Semgrep, Trivy, Gitleaks, AES-256 | At-rest encryption for messages |

---

## 🗄️ Database Architecture: Single Server DB

> [!IMPORTANT]
> **There is ONLY 1 DATABASE for the entire app: MySQL 8 running directly on the EC2 server in Docker.**
> - **Container Name:** `chat_mysql`
> - **Database Name:** `chat_db`
> - **Database User:** `chat_user`
> - **Port:** `127.0.0.1:3306` (strictly internal, blocked from internet)
> - **Storage Mount:** `/opt/chat-app/mysql_data` on server disk
> - **Character Set:** `utf8mb4` (full emoji support for chat)

---

## 🌐 Server Deployment Architecture (`16.113.127.132`)

```
Internet Request (http://16.113.127.132)
                     │
                     ▼
             ┌───────────────┐
             │  Nginx (:80)  │
             └───────┬───────┘
                     │
     ┌───────────────┼────────────────────────┐
     │               │                        │
     ▼               ▼                        ▼
Static Web SPA     REST API (/api/)      WebSockets (/ws)
/opt/chat-app/     Daphne Container      Daphne Container
frontend/          (127.0.0.1:3000)      (127.0.0.1:3000)
                     │                        │
                     └──────────┬─────────────┘
                                │
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
       MySQL 8 Container             Redis 7 Container
        (127.0.0.1:3306)              (127.0.0.1:6379)
```

---

## ⚡ Instant Setup on Server (`16.113.127.132`)

If your Daphne backend is already running on port 3000, set up Nginx and the Frontend with:

```bash
# 1. Install & enable Nginx
sudo apt-get update && sudo apt-get install -y nginx
sudo systemctl enable nginx

# 2. Copy and activate Nginx config
sudo cp nginx.conf /etc/nginx/sites-available/chatapp
sudo ln -sf /etc/nginx/sites-available/chatapp /etc/nginx/sites-enabled/chatapp
sudo rm -f /etc/nginx/sites-enabled/default

# 3. Test and start Nginx
sudo nginx -t
sudo systemctl restart nginx

# 4. Create directories & set permissions
sudo mkdir -p /opt/chat-app/{frontend,media,logs}
sudo chown -R ubuntu:ubuntu /opt/chat-app
sudo chmod -R 775 /opt/chat-app
```

---

## 📱 Android Testing & APK Build (Capacitor)

The mobile client is configured with Capacitor 6 under `client/android`. It embeds the React web application and connects directly to `http://16.113.127.132`.

### Step 1: Build Web and Sync to Android

```powershell
cd client
npm run build:ci
npx cap sync android
```

### Step 2: Generate Debug APK (No keystore required)

```powershell
cd client\android
.\gradlew.bat assembleDebug
```
The generated APK will be at:
`client\android\app\build\outputs\apk\debug\app-debug.apk`

### Step 3: Test on Device or Emulator

```powershell
# Open Android Studio:
cd client
npx cap open android

# Or install directly to connected phone:
adb install android\app\build\outputs\apk\debug\app-debug.apk
```

---

## 🧪 Testing & Quality Gates

```bash
# Backend pytest suite (SQLite isolation)
cd django_server && pytest tests/ -v --cov=apps

# Frontend vitest suite
cd client && npm run test

# Security scanning
cd django_server && bandit -r apps/ core/
```
