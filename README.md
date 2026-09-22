# 💬 Enterprise Real-Time Chat Platform

[![CI/CD Deployment](https://github.com/nikhilchandurkar/chat-app/actions/workflows/deploy.yml/badge.svg)](https://github.com/nikhilchandurkar/chat-app/actions/workflows/deploy.yml)

A scalable, multi-client real-time chat platform with **1 Web Client**, **1 Mobile App (React Native)**, and **2 Interchangeable Backends** (Node.js MERN and Django 5 Daphne ASGI).

Designed for high concurrency, horizontal scalability, and low-resource hardware efficiency.

---

## 🏗️ Monorepo Architecture

```
chat-app/
├── client/              # 💻 Web Client: React 18 + Vite + RTK Query + Tailwind
├── mobile/              # 📱 Mobile Client: React Native + Expo + AsyncStorage
│
├── server/              # 🟢 Backend 1: Node.js + Express + MongoDB Atlas + Socket.IO
│   ├── Dockerfile
│   ├── app.js
│   ├── utils/mailer.js  # (Gmail SMTP & Google App Password sanitized)
│   └── tests/           # (16 Automated unit tests)
│
└── django_server/       # 🐍 Backend 2: Django 5 + Daphne ASGI + PostgreSQL 16 + Redis 7 + Celery
    ├── Dockerfile       # Multi-stage production build (non-root appuser)
    ├── docker-compose.yml # Independent DB, Redis, Celery & Daphne services
    ├── docker_build.sh  # Docker Hub build & push automation
    ├── docker_build.ps1
    ├── run_local.ps1    # Zero-dependency local dev runner (SQLite + in-memory)
    ├── run_local.sh
    ├── core/            # Settings, ASGI, WSGI, URLs, Celery
    ├── apps/
    │   ├── authentication/ # JWT, OTP, RBAC, Friend Requests, MongoDB migration
    │   ├── chat/           # Direct chats, Groups, Admins, Pins, Restrictions
    │   ├── messages_app/   # AES-256 encrypted messages, ThreadPoolExecutor, Reactions
    │   ├── realtime/       # Daphne WebSocket consumers & JWT middleware
    │   └── preview/        # OpenGraph link preview with Redis caching
    └── .github/workflows/  # CI/CD deployment pipeline to EC2 (172.31.13.39)
```

---

## 🚀 Key Features

- **Interchangeable Backends**: Switch between Node.js and Django Daphne without modifying the React frontend or React Native app.
- **Dual Authentication**:
  - Traditional Username/Email + Password
  - Passwordless **6-digit OTP** sent via Celery and cached in Redis
- **Dual Client Token Delivery**:
  - `chitChat-Token` HTTP-only Cookie for Web security (`SameSite=None; Secure=True`)
  - `Authorization: Bearer <token>` header & `?token=` query param for React Native
- **Role-Based Access Control (RBAC)**:
  - `role: "user"`: Chatting, creating groups, file attachments, emoji reactions, message starring
  - `role: "admin"`: Access to system analytics dashboard, user lists, chat audit, and 7-day message metrics
- **Byte-for-Byte AES-256 Encryption**:
  - Uses `aes-256-cbc` with PKCS#7 padding (`ENC:<iv>:<ciphertext>`)
  - 100% interoperable between Node.js `crypto` and Python `cryptography`
- **Low-Resource Hardware Concurrency**:
  - `concurrent.futures.ThreadPoolExecutor` offloads CPU-bound crypto from Daphne's async event loop
  - Persistent database connection pooling (`CONN_MAX_AGE=600`, `CONN_HEALTH_CHECKS=True`)
  - GZip compression middleware reducing network payload size by 70–80%
  - Celery memory guardrails (`--concurrency=2`, `max-memory-per-child=150MB`) preventing OOM crashes on small EC2/VPS instances
- **Automated MongoDB to PostgreSQL Migration**:
  - Built-in Django command migrates `users`, `chats`, `messages`, and `requests`
  - Preserves 24-character ObjectIds and bcrypt password hashes

---

## 🏃‍♂️ Quick Start Guide

### 1. Web Client (`client/`)
```bash
cd client
npm install
npm run dev
```
*Runs on `http://localhost:5173`. Configure `client/.env`:*
```env
VITE_API_BASE_URL=http://localhost:8000   # or http://localhost:3000 for Node
VITE_SOCKET_URL=http://localhost:8000     # or http://localhost:3000 for Node
```

---

### 2. Mobile Client (`mobile/`)
```bash
cd mobile
npm install

# Run on Android Emulator:
npm run android

# Run on iOS Simulator:
npm run ios

# Run on Physical Phone with Expo Go:
npm start
```
*Configurable in `mobile/src/config.js` to point to local host or production server.*

---

### 3. Django Daphne Backend (`django_server/`)

#### Option A: Zero-Dependency Local Dev (SQLite + In-Memory)
Run immediately without installing PostgreSQL or Redis:

**Windows (PowerShell):**
```powershell
cd django_server
.\run_local.ps1
```

**Linux / macOS:**
```bash
cd django_server
chmod +x run_local.sh
./run_local.sh
```

#### Option B: Independent Services via Docker Compose
Each service can run independently or together:
```bash
cd django_server

# Run EVERYTHING together:
docker compose up -d

# Run ONLY PostgreSQL 16 independently:
docker compose up -d db

# Run ONLY Redis 7 independently:
docker compose up -d redis

# Run ONLY Daphne Web Server independently:
docker compose up -d web

# Run ONLY Celery Background Worker independently:
docker compose up -d celery_worker
```

---

### 4. Node.js Backend (`server/`)
```bash
cd server
npm install
npm run dev
```
*Runs on `http://localhost:3000` with MongoDB Atlas connection.*

---

## 🔄 MongoDB to PostgreSQL Data Migration

To import all existing data from MongoDB Atlas into PostgreSQL:

```bash
cd django_server
python manage.py migrate_mongo_to_postgres
```

Optional flags:
- `--clear`: Wipe PostgreSQL data before importing
- `--mongo-uri <URI>`: Override connection string

---

## ⚙️ Environment Configuration

### Django Server (`django_server/.env`)
```env
DEBUG=True
SECRET_KEY=django-insecure-chat-app-production-secret-key-321
ADMIN_SECRET_KEY=chat_app_secret
PORT=8000
CLIENT_URL=https://nikhil-chats.chickenkiller.com

# Database (Leave blank for SQLite, or configure PostgreSQL)
DATABASE_URL=postgresql://chat_user:chat_password@localhost:5432/chat_db

# Redis (Set USE_REDIS=True when Redis is running)
USE_REDIS=True
REDIS_URL=redis://127.0.0.1:6379/0

# AES-256 Message Encryption Key (32 characters)
MESSAGE_ENCRYPTION_KEY=12345678901234567890123456789012

# Gmail SMTP Delivery
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password
EMAIL_FROM=your_email@gmail.com
```

---

## 🚢 CI/CD & Production Deployment (EC2 172.31.13.39)

The GitHub Actions workflow [`.github/workflows/deploy.yml`](file:///.github/workflows/deploy.yml) automatically triggers on push to `main`:

```mermaid
flowchart TD
    A["git push origin main"] --> B["1. Lint & Django System Checks<br/>(python manage.py check)"]
    B --> C["2. Build Multi-Stage Docker Image<br/>(nikhil2523/chat-app-django:latest)"]
    C --> D["3. Deploy on EC2 172.31.13.39<br/>(Self-Hosted Runner)"]
    D --> E["Stop old Node container (chat_app)"]
    E --> F["Ensure PostgreSQL 16 & Redis 7 are running"]
    F --> G["Run DB migrations & migrate_mongo_to_postgres"]
    G --> H["Start chat_django_daphne on Port 3000"]
    H --> I["Start chat_celery_worker for async tasks"]
    I --> J["Verify Health: curl http://127.0.0.1:3000/hello"]
```

### Why Port 3000?
The server's Nginx is already configured to reverse-proxy `/api/` and `/socket.io/` to `http://127.0.0.1:3000`. By running Daphne on port 3000, traffic seamlessly routes to the Django ASGI container with **zero changes to Nginx and zero downtime**.

---

## 📡 API Overview

| Area | Route | Methods | Description |
|---|---|---|---|
| **OTP Auth** | `/api/v1/auth/request-otp` | `POST` | Generate and email 6-digit OTP |
| **OTP Auth** | `/api/v1/auth/verify-otp` | `POST` | Verify code, create session & issue JWT |
| **User** | `/api/v1/user/login` | `POST` | Password login (sets cookie + returns token) |
| **User** | `/api/v1/user/newuser` | `POST` | Register with optional avatar upload |
| **User** | `/api/v1/user/me` | `GET` | Fetch authenticated profile |
| **User** | `/api/v1/user/friends` | `GET` | List friends |
| **Chat** | `/api/v1/chat/new` | `POST` | Create group chat |
| **Chat** | `/api/v1/chat/my` | `GET` | Get all conversations |
| **Chat** | `/api/v1/chat/message` | `POST` | Upload file attachments |
| **Messages** | `/api/v1/message/search/:id` | `GET` | Full-text search in chat |
| **Messages** | `/api/v1/message/:id` | `PATCH`, `DELETE` | Edit or tombstone message |
| **Messages** | `/api/v1/message/react/:id` | `POST` | Emoji reactions |
| **Admin** | `/api/v1/admin/stats` | `GET` | Dashboard metrics & 7-day charts |
| **WebSockets**| `/ws/`, `/ws/chat/`, `/socket.io/`| `WS` | Real-time events (`NEW_MESSAGE`, `START_TYPING`, etc.) |

---

## 📄 License
MIT License.
