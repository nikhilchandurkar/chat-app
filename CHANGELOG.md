# Changelog

All notable changes to this project.

---

## [2.0.0] – 2026-10-31

### Architecture

- **Removed Node.js/Express backend** – replaced by Django 5.1 + Django REST Framework
- **Replaced socket.io** with native WebSocket via Django Channels + a typed browser client (`socket.ts`)
- **Unified `.env`** – single file for both development and production configuration
- **Database multi-backend support** – `DB_ENGINE` env var selects PostgreSQL / MySQL / SQLite3
- **TypeScript** – added `tsconfig.json`; `socket.jsx` converted to `socket.ts` with full type definitions
- **Vite config** – migrated from `vite.config.js` to `vite.config.ts`, added code-splitting for vendor bundles

### CI/CD (`.github/workflows/deploy.yml`)

- Added **Bandit** security scan with JSON report artifact
- Added **SonarCloud** analysis job (runs when `SONAR_TOKEN` is set)
- Added **Trivy** container vulnerability scan with SARIF upload to GitHub Security tab
- Added **Flake8** linting step
- Added **Black** formatting check
- Fixed WebSocket proxy path from `/socket.io/` to `/ws` (matches Django Channels)
- Added `sonar-project.properties`
- Legacy Node.js container removal step added to deploy job
- Docker `system prune` safe cleanup before deploy
- `wsl --update` noted in deployment docs

### Backend

- **`core/settings.py`** – fully rewritten:
  - MySQL support via `DB_ENGINE=mysql`
  - `ALLOWED_HOSTS` from env (space-separated or `*`)
  - Per-endpoint rate limiting via DRF throttle classes
  - `CORS_ALLOWED_ORIGINS` derived from env (no hardcoded production URLs)
  - Production security headers auto-activated when `DEBUG=False`
  - Structured logging with rotating file handler
- **`core/exceptions.py`** – new custom exception handler (consistent `{success, message, errors}` envelope, no stack traces to clients)
- **`apps/realtime/routing.py`** – removed socket.io path, kept `/ws` and `/ws/chat`
- **`requirements.txt`** – added `mysqlclient`, `pytest`, `pytest-django`, `pytest-asyncio`, `pytest-cov`, `factory-boy`, `faker`, `bandit`, `black`, `flake8`, `isort`

### Frontend

- **`src/socket.ts`** – new typed native WebSocket provider (replaces `socket.io-client`)
- **`src/redux/reducers/auth.js`** – added `token` field and `tokenUpdated` action
- **`src/App.jsx`** – passes JWT token to `<SocketProvider>` for WebSocket auth
- **`package.json`** – removed `socket.io-client`; added `@playwright/test`, `vitest`, TypeScript, ESLint TypeScript plugins
- **`tsconfig.json`** – added; allows incremental TypeScript adoption

### Tests (new)

- `django_server/tests/test_authentication.py` – 25 auth tests
- `django_server/tests/test_chat.py` – 12 chat tests
- `django_server/tests/test_messages.py` – 15 message tests including encryption
- `django_server/tests/test_security.py` – 20+ security tests (IDOR, SQL injection input, oversized payloads, error structure)
- `django_server/tests/test_websocket.py` – 8 WebSocket tests (auth, messaging, malformed input)
- `django_server/conftest.py` – shared fixtures (user factory, JWT helpers, direct chat fixture)
- `django_server/pytest.ini` – pytest configuration
- `tests/e2e/auth.spec.ts` – Playwright auth flow tests
- `tests/e2e/chat.spec.ts` – Playwright chat flow tests
- `tests/e2e/playwright.config.ts` – Playwright configuration
- `tests/e2e/helpers.ts` – shared E2E helpers

### Documentation (new)

- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `docs/WEBSOCKETS.md`
- `docs/SECURITY.md`
- `docs/TESTING.md`
- `docs/DEPLOYMENT.md`
- `docs/MOBILE_SETUP.md`
- `docs/USER_MANUAL.md`
- `CHANGELOG.md` (this file)
- `README.md` updated

### Nginx

- Fixed WebSocket proxy from `/socket.io/` → `/ws`
- Added security headers (HSTS, X-Frame-Options, X-Content-Type-Options)
- Added admin rate limiting zone
- Added static asset caching headers

---

## [1.x] – prior

- Node.js/Express backend with MongoDB
- Socket.io WebSockets
- React frontend (JSX only)
- Basic JWT auth
- No tests
- PostgreSQL migration (intermediate)
