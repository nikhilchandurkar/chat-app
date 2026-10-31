# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                       Nginx (443/80)                     │
│  /           → React SPA (static files)                  │
│  /api/       → Django Daphne (port 3000)                │
│  /ws         → Django Channels WebSocket (port 3000)    │
│  /admin/     → Django Admin                              │
└────────────────────────┬────────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │   Django 5.1 ASGI   │
              │   Daphne server     │
              │   port 3000         │
              └──┬──────────────┬───┘
                 │              │
     ┌───────────▼──┐    ┌──────▼──────────┐
     │  PostgreSQL  │    │  Redis 7-alpine  │
     │  port 5432   │    │  port 6379       │
     └──────────────┘    └──────┬───────────┘
                                │
                    ┌───────────▼────────────┐
                    │   Celery Worker (x2)    │
                    │   OTP email, cleanup    │
                    └────────────────────────┘
```

## Django Applications

| App | Responsibility |
|-----|----------------|
| `apps.authentication` | Users, registration, login, OTP, friend requests, admin RBAC |
| `apps.chat` | Conversations (direct + group), membership, pinned messages |
| `apps.messages_app` | Messages, AES-256-CBC encryption, reactions, attachments |
| `apps.realtime` | Django Channels WebSocket consumer |
| `apps.preview` | Link preview caching |

## Database Choice: PostgreSQL

PostgreSQL is used as the primary database because:

- Strong support for UUID primary keys (used throughout the schema)
- Reliable JSONB-compatible JSON fields
- Efficient indexing for time-ordered queries (messages by `chat + created_at`)
- Transactional integrity for multi-step operations (accept friend request + create chat)
- Better concurrent connection handling than MySQL for long-lived Daphne connections

**MySQL support is also available** by setting `DB_ENGINE=mysql` in `.env`.  
The same Django ORM queries work with both backends. MySQL requires `mysqlclient`
(already in `requirements.txt`).

SQLite is available for local development and CI tests (`DB_ENGINE=sqlite3`).

## Redis Usage

Redis is **optional** (`USE_REDIS=False` works without it using in-memory fallbacks).

When enabled (`USE_REDIS=True`):

| Responsibility | Why Redis |
|----------------|-----------|
| Django Channels layer | Enables cross-process WebSocket message broadcast |
| OTP / cache | Short-lived OTP codes (5 min TTL), link preview cache |
| Celery broker | Background task queue for emails |
| Online users set | Fast O(1) presence tracking |

## Celery Usage

Celery handles only genuinely asynchronous operations:

- Send OTP verification emails
- Send password reset emails

Normal chat messages go directly through the WebSocket consumer → database.
They are **not** routed through Celery to keep latency minimal.

## WebSocket Architecture

```
Browser ──(WSS /ws)──► Nginx ──► Daphne ──► ChatConsumer
                                               │
                                    Django Channels layer (Redis)
                                               │
                                 ◄────── group_send to all members
```

The consumer is a single `AsyncJsonWebsocketConsumer` (`apps/realtime/consumers.py`).  
Each authenticated user joins their own group `user_<uuid>` and the global group.

## Memory Profile (1 GB RAM Server)

| Component | Typical RSS |
|-----------|-------------|
| Daphne + Django | 120–200 MB |
| Celery worker (2 × children) | 60–100 MB |
| PostgreSQL | 100–200 MB |
| Redis | 20–50 MB |
| **Total** | **~400–550 MB** |

## Low-Hardware Optimisations

- `CONN_MAX_AGE=600` – persistent DB connections, no new connection per request
- `CELERY_WORKER_CONCURRENCY=2` – conservative worker count
- `CELERY_WORKER_MAX_MEMORY_PER_CHILD=150000` – 150 MB per Celery child
- GZip middleware enabled for all text responses
- Pagination (20 messages per page, cursor-compatible)
- In-memory fallbacks for Redis/Channels in dev (no service required)
- Frontend code-split into chunked bundles (React, Redux, MUI, Charts)
