# Testing

## Overview

| Layer | Tool | Location |
|-------|------|----------|
| Backend unit / integration | pytest + pytest-django | `django_server/tests/` |
| WebSocket | pytest + channels testing | `django_server/tests/test_websocket.py` |
| Security | pytest | `django_server/tests/test_security.py` |
| Frontend unit | Vitest | `client/src/**/*.test.{ts,tsx}` |
| End-to-End (E2E) | Playwright | `tests/e2e/` |

---

## Backend Tests

### Setup

```bash
cd django_server
pip install -r requirements.txt
```

Tests always use **SQLite** (in-memory) — no external services required.

### Run All Backend Tests

```bash
cd django_server
pytest tests/ -v
```

### Run a Specific Test File

```bash
pytest tests/test_authentication.py -v
pytest tests/test_chat.py -v
pytest tests/test_messages.py -v
pytest tests/test_security.py -v
pytest tests/test_websocket.py -v
```

### Run by Marker

```bash
pytest -m auth       # Authentication tests
pytest -m chat       # Chat tests
pytest -m messages   # Message tests
pytest -m security   # Security tests
pytest -m websocket  # WebSocket tests
```

### With Coverage Report

```bash
pytest tests/ --cov=apps --cov-report=html --cov-report=term-missing
# HTML report → htmlcov/index.html
```

---

## Frontend Unit Tests

```bash
cd client
npm run test          # Single run
npm run test:watch    # Watch mode
```

---

## End-to-End Tests (Playwright)

Playwright tests run against the **live application**.  
Both the Django backend and the Vite dev server must be running before tests start.

### Start Services

Terminal 1 – Django backend:
```bash
cd django_server
python manage.py runserver 8000
```

Terminal 2 – React frontend:
```bash
cd client
npm run dev
```

### Install Playwright

```bash
cd tests/e2e
npx playwright install chromium
```

### Run E2E Tests

```bash
cd tests/e2e
npx playwright test

# Run only auth tests
npx playwright test auth.spec.ts

# Run only chat tests
npx playwright test chat.spec.ts

# Interactive UI mode
npx playwright test --ui

# Show report after run
npx playwright show-report playwright-report
```

### Environment Variables for E2E

```bash
E2E_BASE_URL=http://localhost:5173  # Frontend URL (default)
E2E_API_URL=http://localhost:8000   # Backend API URL (default)
```

---

## Security Tests

Security tests are part of the pytest suite. Run them with:

```bash
cd django_server
pytest tests/test_security.py -v -m security
```

These tests verify:
- Authorization boundaries (IDOR prevention)
- SQL-injection-like input handled safely
- Oversized payload rejection
- Error response structure (no stack traces)
- Admin endpoint access control

---

## Linting

```bash
cd django_server
flake8 apps/ core/ --max-line-length=120 --exclude=migrations
black --check . --exclude "migrations|__pycache__"
isort --check-only .
```

---

## Bandit (Security Scan)

```bash
cd django_server
bandit -r apps/ core/ --severity-level medium -f txt
```

---

## CI Test Execution

All tests run automatically in GitHub Actions on every push to `main`.  
See `.github/workflows/deploy.yml` for the full pipeline.

Test artifacts (coverage, Bandit report) are uploaded to GitHub Actions artifacts.

---

## Known Test Limitations

- WebSocket tests use the in-memory channel layer (not Redis). This is correct for
  unit testing but does not cover multi-process message delivery.
- Playwright tests require both services to be running (they are not auto-started
  in the config by default — uncomment `webServer` in `playwright.config.ts` to enable this).
- Celery tasks are tested by mocking the broker (no actual email sending in tests).
