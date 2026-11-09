# Local Development & Testing Setup Guide

This guide provides step-by-step instructions for running the complete messaging stack (Django Daphne ASGI backend, MySQL, Redis, React web client, and React Native Expo mobile app) in a local development environment.

---

## 1. Prerequisites

Ensure your development machine has the following installed:

- **Python**: 3.12 or higher (Python 3.12, 3.13, 3.14, 3.15 supported)
- **Node.js**: 18.x or 20.x LTS
- **npm**: 9.x or higher
- **MySQL Server**: 8.0+ (or SQLite for quick local test runs)
- **Redis Server**: 7.0+ (optional locally if using `USE_REDIS=False`)
- **Git**

---

## 2. Backend Setup (Django ASGI)

### Step 2.1: Clone & Navigate

```bash
git clone <repository-url> chat-app
cd chat-app/django_server
```

### Step 2.2: Create and Activate Virtual Environment

**Windows (PowerShell):**
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

**Linux / macOS:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### Step 2.3: Install Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### Step 2.4: Environment Configuration

Copy the `.env.example` file to `.env`:

```bash
cp .env.example .env
```

For quick local testing with SQLite and in-memory channel layers, update `.env` or set environment variables:
```dotenv
DJANGO_DEBUG=True
DATABASE_ENGINE=django.db.backends.sqlite3
USE_REDIS=False
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
```

For full MySQL 8+ and Redis testing:
```dotenv
DJANGO_DEBUG=True
DATABASE_ENGINE=django.db.backends.mysql
DATABASE_NAME=chat_db
DATABASE_USER=chat_user
DATABASE_PASSWORD=chat_password
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306
USE_REDIS=True
REDIS_URL=redis://127.0.0.1:6379/0
```

### Step 2.5: Apply Database Migrations

```bash
python manage.py migrate
```

### Step 2.6: Run the Test Suite

Verify that all unit and security VAPT tests pass:

```powershell
# In PowerShell:
$env:DATABASE_ENGINE="django.db.backends.sqlite3"; python manage.py test core.tests

# In Bash:
DATABASE_ENGINE=django.db.backends.sqlite3 python manage.py test core.tests
```

Expected output:
```
Ran 20 tests in 0.646s
OK
```

### Step 2.7: Launch the Daphne ASGI Development Server

```bash
python manage.py runserver 8000
# Or directly via daphne:
daphne -b 127.0.0.1 -p 8000 core.asgi:application
```

The server is now listening at `http://127.0.0.1:8000/`. Real-time WebSockets are routed under `ws://127.0.0.1:8000/ws/chat/`.

---

## 3. Web Frontend Setup (React 18 + Vite)

### Step 3.1: Navigate & Install Dependencies

Open a new terminal window:

```bash
cd chat-app/client
npm install
```

### Step 3.2: Configure Environment

Create `client/.env.local`:
```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_WS_URL=ws://127.0.0.1:8000/ws/chat/
```

### Step 3.3: Start Vite Development Server

```bash
npm run dev
```

The web application will open at `http://localhost:5173/`.

### Step 3.4: Verify Production Build

```bash
npm run build
```

This will bundle TypeScript and assets into `client/dist/`.

---

## 4. Mobile Frontend Setup (React Native Expo)

### Step 4.1: Navigate & Install Dependencies

Open a third terminal window:

```bash
cd chat-app/mobile
npm install
```

### Step 4.2: Start Expo Metro Bundler

```bash
npx expo start
```

- Press `a` to open in an Android Emulator.
- Scan the QR code using the Expo Go application on a physical Android device connected to the same Wi-Fi network.

---

## 5. Background Purge Workers (Optional Local Verification)

To test the background purge commands locally:

1. **Purge Expired Disappearing Messages**:
   ```bash
   python manage.py purge_expired_messages
   ```

2. **Purge Expired Statuses**:
   ```bash
   python manage.py purge_expired_statuses
   ```

---

## 6. Common Troubleshooting

| Issue | Root Cause | Solution |
| :--- | :--- | :--- |
| `Can't connect to MySQL server on '127.0.0.1'` | MySQL service is not running locally | Start MySQL or test with SQLite by setting `DATABASE_ENGINE=django.db.backends.sqlite3`. |
| `AttributeError: 'super' object has no attribute 'dicts'` in Python 3.15 | Django 5.1 context copy bug in Python 3.15 | Ensure `core/settings.py` includes the monkey-patch for `BaseContext.__copy__` and `Context.__copy__`. |
| `WebSocket connection failed (403)` | Missing or invalid JWT Bearer token | Ensure client includes `?token=<jwt_access_token>` in the WebSocket URL connection string. |
| Email OTP not delivered | Local console backend configured | Check terminal output where Daphne is running; OTP is printed directly in stdout. |

