# Scalable Django Daphne ASGI Chat Server

A high-concurrency, horizontally scalable real-time chat backend built with **Django 5**, **Daphne ASGI**, **Django Channels**, **PostgreSQL 16**, **Redis 7**, and **Celery**.

This backend is designed as a drop-in, scalable replacement for the Node.js backend, maintaining **100% API and WebSocket compatibility** with the existing React 18 + Vite frontend while adding enterprise-grade features:
- **OTP-Based & Passwordless Authentication** via Redis & Celery async emails
- **Role-Based Access Control (RBAC)** (`admin` vs `user`)
- **AES-256 Message Encryption** matching Node.js `crypto` byte-for-byte
- **Daphne ASGI Application Server** handling HTTP/1.1, HTTP/2, and WebSockets concurrently
- **Standardized API Responses** (consistent `{ "success": true, "message": "...", "data": [...] }`)

---

## 🏗 Architecture Overview

```
                          ┌──────────────────────────┐
                          │ React 18 + Vite Frontend │
                          └─────────────┬────────────┘
                                        │
                         HTTP REST      │  WebSockets (ws://)
                                        │
                                        ▼
                          ┌──────────────────────────┐
                          │   Daphne ASGI Server     │
                          │   (Port 8000 / ASGI)     │
                          └─────────────┬────────────┘
                                        │
           ┌────────────────────────────┼───────────────────────────┐
           │                            │                           │
           ▼                            ▼                           ▼
┌────────────────────┐       ┌────────────────────┐      ┌────────────────────┐
│   PostgreSQL 16    │       │      Redis 7       │      │   Celery Worker    │
│  - Users & Roles   │       │  - Channels Layer  │      │  - Async OTP Email │
│  - Chats & Admins  │       │  - Online Users    │      │  - Password Reset  │
│  - Messages (ENC)  │       │  - Link Previews   │      │  - Media Cleanup   │
└────────────────────┘       └────────────────────┘      └────────────────────┘
```

---

## 🚀 Quick Start (Local Development)

### Option 1: Zero-Dependency Local Dev (SQLite + In-Memory)
You can run the Daphne server immediately without having Postgres or Redis installed locally:

#### Windows (PowerShell):
```powershell
cd e:\chat\django_server
.\run_local.ps1
```

#### Linux / macOS:
```bash
cd django_server
chmod +x run_local.sh
./run_local.sh
```

The script will automatically create `.venv`, install dependencies, run migrations, and launch **Daphne** on `http://127.0.0.1:8000`.

---

### Option 2: Full Production Stack via Docker Compose
To run PostgreSQL 16, Redis 7, Daphne ASGI, and Celery Worker together:
### Option 2: Independent Services via Docker Compose
All services can be started together or completely **independently**:

```bash
cd django_server
docker compose up --build -d

# Run EVERYTHING together:
docker compose up -d

# Run ONLY PostgreSQL 16 independently:
docker compose up -d db

# Run ONLY Redis 7 independently:
docker compose up -d redis

# Run ONLY Daphne Web Server independently:
docker compose up -d web

# Run ONLY Celery Worker independently:
docker compose up -d celery_worker
```

Services started:
- `chat_postgres` (Port `5432`)
- `chat_redis` (Port `6379`)
- `chat_django_daphne` (Port `8000`)
- `chat_celery_worker` (Background Worker)
To stop specific services or everything:
```bash
# Stop a single service:
docker compose stop db
docker compose stop redis

To stop the services:
```bash
# Stop everything:
docker compose down
```

---

### Option 3: Build & Push Docker Image Locally

Use the automated multi-stage build scripts:

**On Windows (PowerShell):**
```powershell
.\docker_build.ps1 -Tag latest -VersionTag v1.0.0
```

**On Linux / macOS:**
```bash
chmod +x docker_build.sh
./docker_build.sh latest v1.0.0
```

This runs pre-build checks, logs into Docker Hub with your credentials (`nikhil2523`), builds the multi-stage image, and pushes `nikhil2523/chat-app-django:latest`.

---

## 🚀 CI/CD Pipeline (GitHub Actions)

Located at `.github/workflows/deploy.yml`:
- **Trigger**: Every push to `main` or manual trigger.
- **Job 1 (Lint & Integrity)**: Runs Django system checks (`manage.py check`) and validates AST syntax.
- **Job 2 (Build & Push)**: Builds the multi-stage Docker image and pushes `nikhil2523/chat-app-django:latest` to Docker Hub.
- **Job 3 (Continuous Deployment)**: Executes on the self-hosted runner installed on EC2 instance `172.31.13.39`, pulls the latest Docker image, and restarts the services with zero downtime.

---

## 🔒 Environment Configuration (`.env`)

Copy `.env.example` to `.env`:

```env
# Core
DEBUG=True
SECRET_KEY=django-insecure-dev-secret-key
ADMIN_SECRET_KEY=chat_app_secret
PORT=8000
CLIENT_URL=https://nikhil-chats.chickenkiller.com

# Database (Leave blank for SQLite, or configure PostgreSQL)
DATABASE_URL=postgresql://chat_user:chat_password@localhost:5432/chat_db

# Redis & Channels (Set USE_REDIS=True when Redis is active)
USE_REDIS=True
REDIS_URL=redis://127.0.0.1:6379/0

# AES-256 Encryption
MESSAGE_ENCRYPTION_KEY=12345678901234567890123456789012

# Gmail SMTP Delivery
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password
```

---

## 📡 API Endpoints

### 1. Modern Authentication (`/api/v1/auth/`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/request-otp` | Generate 6-digit OTP and send via Celery |
| `POST` | `/api/v1/auth/verify-otp` | Verify OTP code & set `chitChat-Token` JWT cookie |

### 2. User Endpoints (`/api/v1/user/`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/user/newuser` | Register user with optional avatar file |
| `POST` | `/api/v1/user/login` | Login with username/email + password |
| `GET` | `/api/v1/user/me` | Fetch authenticated user profile |
| `PUT` | `/api/v1/user/profile` | Update name, bio, or avatar |
| `PUT` | `/api/v1/user/password` | Change password |
| `POST` | `/api/v1/user/forgot-password` | Send password reset email link |
| `POST` | `/api/v1/user/reset-password` | Set new password with token |
| `PUT` | `/api/v1/user/status` | Update status (`online`, `away`, `busy`, `dnd`) |
| `PUT` | `/api/v1/user/privacy` | Update privacy settings |
| `POST` | `/api/v1/user/logout` | Clear session cookie |
| `GET` | `/api/v1/user/search?name=` | Search users |
| `PUT` | `/api/v1/user/sendrequest` | Send friend request |
| `PUT` | `/api/v1/user/acceptrequest` | Accept or reject friend request |
| `GET` | `/api/v1/user/notifications` | Pending friend requests |
| `GET` | `/api/v1/user/friends` | Friends list |
| `POST` | `/api/v1/user/star/:id` | Star / unstar message |
| `GET` | `/api/v1/user/starred` | Get starred messages |

### 3. Chat Endpoints (`/api/v1/chat/`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/chat/new` | Create group chat |
| `GET` | `/api/v1/chat/my` | Get all user chats (direct & group) |
| `GET` | `/api/v1/chat/my/groups` | Get user created groups |
| `GET` | `/api/v1/chat/:id?populate=true` | Chat details |
| `PUT` | `/api/v1/chat/:id` | Rename group / update group avatar |
| `PUT` | `/api/v1/chat/addmembers` | Add members to group |
| `PUT` | `/api/v1/chat/removemember` | Remove member from group |
| `DELETE` | `/api/v1/chat/leave/:id` | Leave group |
| `DELETE` | `/api/v1/chat/:id` | Delete chat |
| `PUT` | `/api/v1/chat/:id/restrict` | Toggle admin-only messaging |
| `POST` | `/api/v1/chat/add-admin` | Promote member to group admin |
| `POST` | `/api/v1/chat/remove-admin` | Demote group admin |
| `GET` | `/api/v1/chat/:chatId/pins` | Get pinned messages (max 3) |
| `POST` | `/api/v1/chat/:chatId/pin/:msgId` | Pin message |
| `DELETE` | `/api/v1/chat/:chatId/pin/:msgId` | Unpin message |
| `POST` | `/api/v1/chat/message` | Upload attachments (1-5 files) |
| `GET` | `/api/v1/chat/message/:id?page=1` | Get paginated chat messages |

### 4. Message Endpoints (`/api/v1/message/`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/message/search/:chatId?q=` | Full text search in chat |
| `PATCH` | `/api/v1/message/:id` | Edit message content |
| `DELETE` | `/api/v1/message/:id` | Soft delete message (tombstone) |
| `POST` | `/api/v1/message/react/:id` | Toggle emoji reaction |
| `POST` | `/api/v1/message/forward` | Forward message to multiple chats |
| `GET` | `/api/v1/message/media/:chatId` | Chat media gallery |

### 5. Link Preview (`/api/v1/preview`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/preview?url=` | Scrapes OpenGraph tags with Redis caching |

### 6. Admin Panel (`/api/v1/admin/`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/admin/verify` | Authenticate admin secret |
| `POST` | `/api/v1/admin/logout` | Logout admin |
| `GET` | `/api/v1/admin/users` | List all users with group/friend counts |
| `GET` | `/api/v1/admin/chats` | List all chats with member/message counts |
| `GET` | `/api/v1/admin/messages` | List all messages |
| `GET` | `/api/v1/admin/stats` | Dashboard metrics & 7-day message charts |

---

## ⚡ WebSockets (Daphne / Django Channels)

WebSocket URLs:
- `ws://localhost:8000/ws/`
- `ws://localhost:8000/ws/chat/`
- `ws://localhost:8000/socket.io/`

Supported Events:
- `NEW_MESSAGE`: Send text message, auto-persisted and broadcasted
- `START_TYPING` / `STOP_TYPING`: Real-time typing bubbles
- `MESSAGE_READ`: Read receipts
- `ONLINE_USERS`: Real-time online user tracking
- `MESSAGE_EDITED` / `MESSAGE_DELETED`: Real-time message updates
- `MESSAGE_REACTED`: Live emoji reactions
- `REFETCH_CHATS`: Live chat list re-synchronization

