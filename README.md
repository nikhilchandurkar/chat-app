# Chat App

A high-performance, secure, real-time chat application built with Django and React.

## Features

- Real-time messaging via Django Channels WebSockets
- Direct and group conversations
- AES-256-CBC message encryption at rest
- File attachments
- OTP + password authentication
- Message reactions, replies, edit, delete
- Pinned messages, message search
- Online presence indicators
- Typing indicators
- Admin dashboard with stats
- Friend request system
- Link preview caching
- Mobile-ready REST + WebSocket API

## Technology Stack

| Layer | Technology |
|-------|------------|
| Backend | Django 5.1, Django REST Framework, Daphne (ASGI) |
| Real-time | Django Channels, Redis (optional) |
| Background tasks | Celery |
| Database | PostgreSQL (default) or MySQL or SQLite3 |
| Frontend | React 18, TypeScript, Vite, MUI |
| WebSocket (client) | Native browser WebSocket (no socket.io) |
| Testing | pytest, pytest-django, Playwright |
| Security scanning | Bandit, Trivy, SonarCloud |
| CI/CD | GitHub Actions → Docker → EC2 |

## Quick Start

### Backend

```bash
cd django_server
python -m venv venv && venv\Scripts\activate   # Windows
pip install -r requirements.txt
cp .env.example .env          # Edit .env (see .env.example)
python manage.py migrate
python manage.py runserver 8000
```

### Frontend

```bash
cd client
npm install
# Create client/.env with: VITE_SERVER=http://localhost:8000
npm run dev
# → http://localhost:5173
```

### Docker Compose (everything at once)

```bash
cd django_server
cp .env.example .env          # Edit with your settings
docker compose up -d
```

## Development Commands

| Task | Command |
|------|---------|
| Run backend | `cd django_server && python manage.py runserver` |
| Run Daphne ASGI | `cd django_server && daphne -p 8000 core.asgi:application` |
| Run frontend | `cd client && npm run dev` |
| Run Celery | `cd django_server && celery -A core worker -l info` |
| Backend tests | `cd django_server && pytest tests/ -v` |
| Backend tests + coverage | `cd django_server && pytest tests/ --cov=apps` |
| Frontend unit tests | `cd client && npm run test` |
| E2E Playwright tests | `cd tests/e2e && npx playwright test` |
| Linting | `cd django_server && flake8 apps/ core/` |
| Security scan | `cd django_server && bandit -r apps/ core/` |

## Environment

All configuration is in a **single `.env` file** (`django_server/.env`).  
One file serves both development and production — just change the values.

See `django_server/.env.example` for the full reference.

Key variables:

```bash
DEBUG=True                    # False in production
SECRET_KEY=...                # Change this!
DB_ENGINE=postgresql          # postgresql | mysql | sqlite3
DATABASE_URL=postgresql://... # PostgreSQL connection
USE_REDIS=False               # True when Redis is running
MESSAGE_ENCRYPTION_KEY=...    # 32-char AES key (change this!)
```

## Documentation

| Document | Description |
|----------|-------------|
| `docs/ARCHITECTURE.md` | System design, components, database choice |
| `docs/API.md` | REST API endpoints reference |
| `docs/WEBSOCKETS.md` | WebSocket events and protocol |
| `docs/SECURITY.md` | Security controls and deployment checklist |
| `docs/TESTING.md` | How to run all tests |
| `docs/DEPLOYMENT.md` | Local, Docker, and server deployment |
| `docs/MOBILE_SETUP.md` | Android / React Native connection guide |
| `docs/USER_MANUAL.md` | End-user guide |
| `CHANGELOG.md` | Change history |
