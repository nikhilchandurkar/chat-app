# 💬 Secure Real-Time Messaging Platform (Android + Web)

[![CI Pipeline](https://github.com/nikhilchandurkar/chat-app/actions/workflows/ci.yml/badge.svg)](https://github.com/nikhilchandurkar/chat-app/actions/workflows/ci.yml)
[![Security VAPT Scan](https://github.com/nikhilchandurkar/chat-app/actions/workflows/security.yml/badge.svg)](https://github.com/nikhilchandurkar/chat-app/actions/workflows/security.yml)
[![Python 3.12+](https://img.shields.io/badge/python-3.12+-blue.svg)](https://www.python.org/downloads/)
[![Django 5.1](https://img.shields.io/badge/django-5.1-green.svg)](https://www.djangoproject.com/)
[![React 18](https://img.shields.io/badge/react-18-61dafb.svg)](https://react.dev/)
[![React Native Expo](https://img.shields.io/badge/react--native-expo-black.svg)](https://expo.dev/)
[![Security VAPT](https://img.shields.io/badge/security-VAPT%20passed%20(20%2F20)-brightgreen.svg)](docs/SECURITY_VAPT_REPORT.md)

An enterprise-grade, self-hosted, end-to-end messaging platform designed for privacy, zero-BOLA authorization, low latency, and production reliability.

The system features a **unified Django Daphne ASGI backend**, **MySQL 8+**, **Redis 7+ Streams**, **React 18 web application**, and **React Native Android mobile application** with **direct Firebase Cloud Messaging (FCM HTTP v1)** and **private EC2 EBS storage**.

---

## 🏗️ Monorepo Architecture

```
chat-app/
├── client/                     # 💻 Web Application (React 18, Vite, TypeScript, Tailwind)
├── mobile/                     # 📱 Mobile Application (React Native, Expo, Native FCM, Keystore)
├── django_server/              # 🐍 Backend (Django 5.1, Daphne ASGI, MySQL 8+, Redis 7+, Channels)
│   ├── apps/
│   │   ├── authentication/     # Passwordless Email OTP, OAuth (Google/GitHub/FB), Privacy
│   │   ├── chat/               # Conversations, Memberships, Private Invitation Links
│   │   ├── messages_app/       # Real-time messages, Ephemeral/Disappearing timers, Reactions
│   │   ├── storage_app/        # Resumable chunked uploads, Magic validation, Authenticated streaming
│   │   ├── status_app/         # 24h User Statuses/Stories with author viewer analytics
│   │   ├── notifications/      # Native FCM HTTP v1 & VAPID Web Push dispatchers
│   │   ├── realtime/           # Daphne WebSocket consumers (/ws/chat/) & JWT Auth
│   │   └── outbox/             # Transactional Outbox pattern for reliable notification delivery
│   ├── core/                   # Django settings, ASGI routing, URL routing, VAPT tests
│   └── templates/emails/       # Responsive branded HTML & plain-text transactional emails
├── deploy/                     # 🚀 Production Deployment Assets
│   ├── systemd/                # ASGI, Outbox, Celery, and Celery Beat systemd services
│   └── scripts/                # Automated backup.sh, restore.sh, and deploy.sh scripts
├── docs/                       # 📚 Complete 15-Document Technical Documentation Suite
├── nginx.conf                  # 🛡️ Hardened Production Nginx reverse proxy configuration
└── .env.example                # 🔐 Environment variables configuration template
```

---

## 🌟 Core Features & Security Guarantees

- **Strict Message Privacy & Zero IDOR/BOLA**:
  - Every REST request and WebSocket event verifies explicit conversation membership via `ConversationMember`.
  - User C cannot read, forward, react to, star, or delete messages between User A and User B.
  - Verified by 20 automated unit and penetration tests (`docs/SECURITY_VAPT_REPORT.md`).
- **Cryptographic Passwordless Authentication**:
  - Zero passwords stored, zero SMS OTP, zero Firebase Auth lock-in.
  - 6-digit cryptographic codes generated via `secrets.randbelow()`, salted with 16 random bytes and SHA-256 hashed.
  - 5-minute TTL, 60s cooldown, max 5 attempts before permanent invalidation, constant-time `secrets.compare_digest` verification, and atomic database row locking (`select_for_update`) preventing concurrency race conditions.
- **Enterprise OAuth 2.0**:
  - Google, GitHub, and Facebook integration with strict `email_verified` enforcement preventing OAuth pre-hijacking.
- **Private Attachment Storage on EC2 EBS**:
  - Attachments are stored on private EBS mounts (`STORAGE_ROOT`).
  - Zero direct or predictable public URLs. All downloads traverse Django's authenticated `StreamDownloadView`, verifying conversation membership and unexpired status, with full HTTP 206 `Range` byte support.
  - File validator checks leading magic bytes (blocking `MZ`, `ELF`, Java class, shell scripts, PHP tags), sanitizes path traversal, and enforces user quotas.
- **Disappearing Messages (Ephemeral Mode)**:
  - Conversations support TTLs (30s, 1m, 1h, 24h, 7d).
  - Messages automatically disappear from queries upon expiration and are permanently purged from database and disk via `purge_expired_messages`.
- **24-Hour User Status / Stories**:
  - Text, image, and video statuses with granular privacy controls (everyone, contacts, nobody).
  - Status viewers list is strictly accessible to the author. Expired statuses are purged via `purge_expired_statuses`.
- **Granular Privacy Controls**:
  - Hide from search, hide online presence, hide avatar, disable read receipts, disable typing indicators.
- **Direct Native Push Notifications**:
  - Android: Direct Native Firebase Cloud Messaging (FCM HTTP v1) using Google service account keys.
  - Web: RFC 8291 Web Push using VAPID keys.

---

## 🏃‍♂️ Quick Start (Local Development)

### 1. Backend (Django Daphne ASGI)

```bash
cd django_server

# Create virtual environment
python -m venv venv
# Windows:
.\venv\Scripts\Activate.ps1
# Linux / macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run migrations & tests (SQLite test mode)
$env:DATABASE_ENGINE="django.db.backends.sqlite3"  # or export DATABASE_ENGINE=...
python manage.py migrate
python manage.py test core.tests

# Start Daphne server
daphne -b 127.0.0.1 -p 8000 core.asgi:application
```

### 2. Web Application (React 18 + Vite)

```bash
cd client
npm install
npm run dev
```
*Web client opens at `http://localhost:5173`.*

### 3. Mobile Application (React Native Expo)

```bash
cd mobile
npm install
npx expo start
```
*Press `a` for Android Emulator or scan QR code via Expo Go.*

---

## 🧪 Automated Testing & Security Verification

Run the full suite of unit tests and VAPT security exploit reproductions:

```bash
cd django_server
$env:DATABASE_ENGINE="django.db.backends.sqlite3"
python manage.py test core.tests
```

**Results**:
```
Ran 20 tests in 0.646s
OK
```

All 20 tests pass with zero errors, confirming BOLA isolation, OTP rate limits, magic file blocking, and privacy enforcement.

---

## 📚 Complete Documentation Suite

Detailed architectural guides and runbooks are available in the [`docs/`](docs/) directory:

1. [**Project Overview**](docs/PROJECT_OVERVIEW.md) - System architecture and technology stack.
2. [**Implementation Plan**](docs/IMPLEMENTATION_PLAN.md) - Engineering execution and milestone review.
3. [**Local Setup Guide**](docs/LOCAL_SETUP.md) - Step-by-step developer environment setup.
4. [**Authentication Setup**](docs/AUTHENTICATION_SETUP.md) - Passwordless OTP and JWT architecture.
5. [**OAuth 2.0 Setup**](docs/OAUTH_SETUP.md) - Google, GitHub, and Facebook provider configuration.
6. [**Email System Setup**](docs/EMAIL_SETUP.md) - Transactional email templates and SMTP setup.
7. [**Android Studio Build Guide**](docs/ANDROID_STUDIO_BUILD.md) - Release APK & AAB compilation and signing.
8. [**Web Application Testing**](docs/WEB_TESTING.md) - E2E verification matrices and push testing.
9. [**Production EC2 Deployment**](docs/EC2_DEPLOYMENT.md) - Ubuntu provisioning, systemd, and Nginx.
10. [**Security & VAPT Report**](docs/SECURITY_VAPT_REPORT.md) - Vulnerability findings, fixes, and test evidence.
11. [**Privacy Policy Implementation**](docs/PRIVACY_POLICY_IMPLEMENTATION.md) - Ephemeral messages, privacy controls, GDPR.
12. [**Backup & Disaster Recovery**](docs/BACKUP_RESTORE.md) - MySQL dumps, storage archives, and restore procedures.
13. [**CI/CD Pipelines**](docs/CI_CD.md) - GitHub Actions workflows for tests, security, and deployments.
14. [**REST & WebSocket API Specs**](docs/API_DOCUMENTATION.md) - Full endpoint inventory and WebSocket frames.
15. [**Troubleshooting Guide**](docs/TROUBLESHOOTING.md) - Diagnostic workflows for production issues.

---

## 🛡️ License & Responsible Disclosure

This platform is developed for production deployment. For security vulnerabilities, review [docs/SECURITY_VAPT_REPORT.md](docs/SECURITY_VAPT_REPORT.md) and report concerns to the security team.
