# 💬 Secure Real-Time Messaging Platform (ChitChat)

[![CI Pipeline](https://github.com/nikhilchandurkar/chat-app/actions/workflows/ci.yml/badge.svg)](https://github.com/nikhilchandurkar/chat-app/actions/workflows/ci.yml)
[![Security VAPT Scan](https://github.com/nikhilchandurkar/chat-app/actions/workflows/security.yml/badge.svg)](https://github.com/nikhilchandurkar/chat-app/actions/workflows/security.yml)
[![Live App](https://img.shields.io/badge/Live-chat--nikkiii.duckdns.org-236B4A?style=flat&logo=nginx)](https://chat-nikkiii.duckdns.org)
[![Python 3.12+](https://img.shields.io/badge/python-3.12+-blue.svg)](https://www.python.org/downloads/)
[![Django 5.1](https://img.shields.io/badge/django-5.1-green.svg)](https://www.djangoproject.com/)
[![MySQL 8+](https://img.shields.io/badge/mysql-8.0+-orange.svg)](https://www.mysql.com/)
[![React 18](https://img.shields.io/badge/react-18-61dafb.svg)](https://react.dev/)

A high-performance, enterprise-grade, end-to-end messaging platform designed for privacy, zero-BOLA authorization, low latency, and production reliability.

The system features a **unified Django Daphne ASGI backend**, **MySQL 8+**, **Redis 7+ Streams**, a **React 18 web application**, and **mobile clients (Capacitor & React Native)** with **Firebase Cloud Messaging (FCM HTTP v1)** and **private file storage**.

---

## 🛠️ Complete Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Backend** | Python 3.12, Django 5.1, DRF | REST API + ASGI routing |
| **ASGI Server** | Daphne 4.1 | Handles HTTP & WebSockets |
| **Real-Time** | Django Channels 4.2 | Native WebSockets at `/ws/chat/` |
| **Database** | **MySQL 8.0 (Single Server DB)** | Container `chat_mysql`, internal port `3306`, `utf8mb4` emoji support |
| **Cache & Task Broker** | Redis 7 Alpine | Container `chat_redis`, internal port `6379` |
| **Task Queue** | Celery 5.4 | Background workers for notifications and email delivery |
| **Web & Proxy Server** | Nginx | Port `80` (HTTP) → Serves React static SPA + proxies API/WebSockets |
| **Frontend** | React 18, TypeScript, Vite 6 | Material-UI (MUI), Redux Toolkit, Framer Motion, Axios |
| **Mobile** | Capacitor 6 & React Native | Android app connecting to live API & WebSocket server |
| **CI/CD** | GitHub Actions | 7-Stage pipeline (Lint, SAST, Dependency audit, Tests, Build, Scan, EC2 Deploy) |
| **Security** | Bandit, Semgrep, Trivy, Gitleaks, AES-256 | At-rest encryption for sensitive data |

---

## 🏗️ Architecture & Directory Tree

```
chat-app/
├── client/                     # 💻 Web App (React 18 + Vite + MUI)
│   ├── android/                # 📱 Capacitor Android Studio Project
│   ├── src/
│   │   ├── components/         # Reusable UI components & dialogs
│   │   ├── pages/              # Chat, Dashboard, Login, Groups
│   │   ├── redux/              # RTK Store, API slices, state
│   │   └── socket.jsx          # Native WebSocket client provider
│   └── dist/                   # Production build assets
├── django_server/              # 🐍 Backend (Django 5.1 + Daphne ASGI)
│   ├── apps/
│   │   ├── authentication/     # Users, Profiles, Contacts, Requests, OTP
│   │   ├── chat/               # Conversations, Members, Invite Links
│   │   ├── messages_app/       # Messages, Reactions, Attachments, Encryption
│   │   ├── notifications/      # FCM Direct HTTP v1 & Web Push (VAPID)
│   │   ├── outbox/             # Transactional Outbox Pattern & Redis Streams
│   │   ├── realtime/           # Django Channels Consumers & WS Routing
│   │   ├── status_app/         # Ephemeral 24hr Status Stories
│   │   └── storage_app/        # Private Chunked File Storage & Streaming
│   └── core/                   # ASGI/WSGI, Settings, URLs, Tests
├── docs/                       # 📚 Full Architectural & Operational Guides
├── mobile/                     # 📱 React Native Mobile Project
├── nginx.conf                  # 🌐 Production Nginx Reverse Proxy Config
└── setup_mysql_and_env.ps1     # ⚡ 1-Click MySQL & Environment Windows Setup
```

---

## 🏃‍♂️ Quick Start (Local Development)

### 1. Database & Backend Setup (Windows PowerShell)

Run the automated one-click setup script from the root directory:

```powershell
.\setup_mysql_and_env.ps1
```

Or manually:

```powershell
cd django_server
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py test core.tests
daphne -b 127.0.0.1 -p 8000 core.asgi:application
```

### 2. Frontend Web Application (React 18 + Vite)

```powershell
cd client
npm install
npm run dev
```

*Web client opens at `http://localhost:5173`.*

---

## 📱 Mobile Setup & Android APK

```powershell
cd client
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

Debug APK output:
`client\android\app\build\outputs\apk\debug\app-debug.apk`

---

## 🧪 Testing & Verification

```bash
# Backend test suite (MySQL 8)
cd django_server
python manage.py test core.tests

# Frontend production build
cd client
npm run build
```

---

## 📚 Complete Documentation Suite

Detailed operational runbooks are located in [`docs/`](docs/):

1. [**Project Overview**](docs/PROJECT_OVERVIEW.md) - System architecture and technology stack.
2. [**Local Setup Guide**](docs/LOCAL_SETUP.md) - Developer environment configuration.
3. [**Authentication Setup**](docs/AUTHENTICATION_SETUP.md) - Passwordless OTP and JWT architecture.
4. [**OAuth 2.0 Setup**](docs/OAUTH_SETUP.md) - Google, GitHub, and Facebook provider configuration.
5. [**Email System Setup**](docs/EMAIL_SETUP.md) - Transactional email templates and SMTP setup.
6. [**Android Studio Build Guide**](docs/ANDROID_STUDIO_BUILD.md) - Release APK compilation and signing.
7. [**Production EC2 Deployment**](docs/EC2_DEPLOYMENT.md) - Ubuntu provisioning, systemd, and Nginx.
8. [**Security & VAPT Report**](docs/SECURITY_VAPT_REPORT.md) - Vulnerability findings and test evidence.
9. [**Backup & Disaster Recovery**](docs/BACKUP_RESTORE.md) - MySQL dumps, storage archives, and restore procedures.
10. [**REST & WebSocket API Specs**](docs/API_DOCUMENTATION.md) - Endpoint inventory and WebSocket frames.

---

## 🛡️ License

This project is licensed under the MIT License.
