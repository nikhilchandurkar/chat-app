# Project Audit & Migration Strategy

**Date:** November 2026  
**Auditor:** Senior Software Architect & Engineering Lead  
**Scope:** Complete inspection of `chat-app` repository, identifying existing components, architectural discrepancies, migration requirements, and implementation blueprint.

---

## 1. Executive Summary

The repository previously contained fragmented implementations across two different backends:
1. A legacy **Node.js / Express** backend (`server/`) utilizing MongoDB (Mongoose), Socket.IO, Multer, and Bcrypt.
2. An incomplete **Django** backend (`django_server/`) configured primarily with PostgreSQL and partially mirroring Node.js endpoints.
3. A React web frontend (`client/`) configured with Vite, Material-UI, and Socket.IO.
4. A minimal React Native mobile application (`mobile/`) with basic username/password screens and Socket.IO networking.

To comply with the Master Project Requirements, the Node.js backend is being completely decommissioned and removed. All backend logic, real-time networking, media storage, push notifications, and authentication are being unified under a production-ready **Django 5.1+ / ASGI** backend backed by **MySQL 8+**, **Redis 7+ (with Redis Streams & Channels)**, and a private file storage engine.

---

## 2. Inventory of Existing Components

| Component | Path | Language / Framework | Primary Purpose | Status / Action |
| :--- | :--- | :--- | :--- | :--- |
| **Node.js Backend** | `server/` | Node.js (ESM), Express, Mongoose, Socket.IO | Legacy REST API & Socket.IO server | **Decommission & Remove** completely |
| **Django Backend** | `django_server/` | Python 3, Django, DRF, Channels, Celery | Modern ASGI backend | **Refactor & Complete** to MySQL, Redis Streams, OTP/OAuth |
| **Web Frontend** | `client/` | React 18, Vite, Redux Toolkit, MUI | Browser messaging interface | **Refactor to Modern Design System**, native WebSockets, OTP/OAuth |
| **Mobile Frontend** | `mobile/` | React Native, Expo 51, React Navigation | Android mobile client | **Rebuild to Complete Android App**, native FCM, offline sync |
| **Nginx Config** | `nginx.conf` | Nginx reverse proxy | EC2 reverse proxy | **Update** for unified Django ASGI, WSS, media streaming |
| **CI/CD** | `.github/workflows/` | GitHub Actions | Deployment pipeline | **Upgrade** with automated testing, linting, security scanning |

---

## 3. Discovered Deficiencies & Architectural Gaps

1. **Dual Backend Confusion**: The presence of both `server/` (Node.js) and `django_server/` (Python) created duplication, broken contracts, and conflicting transport layers (Socket.IO vs Django Channels).
2. **Database Engine Divergence**: Legacy Node server used MongoDB; Django server had PostgreSQL hardcoded. The requirement strictly mandates **MySQL 8+** with fully normalized tables and transactional integrity.
3. **Authentication Strategy Non-Compliance**: Previous code used username and passwords. The mandated requirement is strictly **Passwordless Email OTP** plus **Social OAuth (Google, GitHub, Facebook)** with JWT token rotation and device session tracking.
4. **WebSocket Protocol Divergence**: Frontends connected via `socket.io-client`. Django Channels uses standard WebSocket protocol (`ws://` / `wss://`). Real-time communication was broken between client and Django server.
5. **Lack of Transactional Outbox & Redis Streams**: Real-time events were published directly or via in-memory channel layers without stream persistence, consumer groups, or fault tolerance.
6. **Insecure & Uncontrolled File Handling**: File uploads relied on public media URLs or local server paths without chunking, MIME magic verification, malware scanning hooks, or range-request streaming.
7. **Missing Native Notifications**: No direct FCM HTTP v1 integration for Android; missing self-hosted Web Push (VAPID) for web browsers.
8. **Incomplete Mobile Implementation**: `mobile/` had only 3 rudimentary screens with basic fetch calls, missing offline sync, voice notes, media gallery, group management, and device registration.

---

## 4. Features Requiring Migration & Consolidation

All functional capabilities from Node.js and the initial Django prototype are preserved and migrated into the Django architecture:

- **Authentication & Accounts**:
  - Email OTP generation, secure HMAC/SHA-256 hashing, rate limiting, single-use enforcement, 5-minute TTL.
  - Social OAuth verification: Google (OpenID Connect / ID Token), GitHub (OAuth access token & email scope), Facebook (Graph API token validation).
  - Multi-device sessions, JWT access/refresh token rotation, remote session revocation.
- **Messaging & Conversations**:
  - One-to-one direct conversations and multi-member group chats.
  - Full message lifecycle: creation, optimistic updates, soft delete (for me / for everyone), edits, reactions, replies, pins, stars, drafts, scheduled messages.
  - Read receipts (`sent`, `delivered`, `read`) with timestamp and per-user receipts in groups.
  - Typing indicators and real-time presence (online / last seen) governed by user privacy settings.
- **Private File Sharing**:
  - Resumable chunked uploads with SHA-256 integrity verification.
  - Authenticated streaming download with `Range` header support.
  - MIME signature sniffing and thumbnail generation for images and videos.
- **Real-Time & Background Infrastructure**:
  - Django Channels ASGI routing on `/ws/chat/` with JWT query-param/header authentication.
  - Redis Streams (`chat:events`, `chat:messages`, `chat:receipts`, `chat:notifications`) with persistent consumer groups.
  - MySQL Transactional Outbox guaranteeing zero message loss even during Redis downtime.
- **Push Notifications**:
  - Native FCM HTTP v1 service using Google OAuth2 credentials for Android.
  - RFC 8291 / RFC 8292 Web Push with VAPID keys for modern browsers.

---

## 5. Target Architecture

```
                          [ Client Layer ]
              +-------------------+-------------------+
              |                                       |
      [ Android App ]                         [ Web Browser ]
 (React Native Expo + FCM)             (React + TypeScript + Web Push)
              |                                       |
              +-------------------+-------------------+
                                  |
                           HTTPS / WSS (:443)
                                  v
                           [ Nginx Reverse Proxy ]
                          /                       \
          HTTP REST & Media                        WSS WebSocket
                 |                                      |
                 +-------------------+------------------+
                                     v
                        [ Daphne / ASGI Application ]
                                     |
              +----------------------+----------------------+
              |                      |                      |
              v                      v                      v
      [ Django DRF API ]    [ Channels Realtime ]   [ Private Storage ]
              |                      |              (EC2 EBS / S3 ready)
              v                      v
      [ MySQL 8+ Database ]  [ Redis 7+ Cache & Streams ]
         (Permanent Truth)   (Channel Layers & Stream Consumers)
              ^                      |
              |                      v
              +------------ [ Celery / Outbox Worker ]
                                     |
                          +----------+----------+
                          |                     |
                          v                     v
                   [ Direct FCM v1 ]     [ VAPID Web Push ]
```

---

## 6. Migration Risk Assessment & Mitigation

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **API Contract Breaking** | High | Standardize all endpoints under `/api/v1/` with backward-compatible response schemas. |
| **Real-time Event Divergence** | Critical | Adopt a strict JSON event schema (`event`, `event_id`, `conversation_id`, `message_id`, `timestamp`, `data`) shared across web and Android. |
| **Database Migration Glitches** | High | Implement clean Django models with MySQL 8+ engine, composite indexes, and strict foreign key constraints. Provide SQLite fallback for local test execution without MySQL installed. |
| **WebSocket Reconnection Storms** | Medium | Implement exponential backoff jitter on both Web and Android, combined with cursor-based offline sync. |
| **File Upload Memory Exhaustion** | High | Use chunked resumable upload sessions with streaming assembly directly to disk. |

---

## 7. Audit Conclusion

The migration plan is sound, removes tech debt from redundant Node.js services, unifies the stack on Python/Django + MySQL + Redis, and elevates both frontend clients to production-grade quality. Execution proceeds immediately to Phase 2.

