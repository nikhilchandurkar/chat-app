"""
Django settings for the Chat Application.

Supports three database backends via DB_ENGINE env var:
  postgresql  – PostgreSQL (default, recommended)
  mysql       – MySQL / MariaDB
  sqlite3     – SQLite (dev / tests only)

All configuration is driven by environment variables.
See .env.example for the full reference.
"""

import os
from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Load .env file (single file for all environments)
load_dotenv(BASE_DIR / ".env")

# ─── Core Security ────────────────────────────────────────────────────────────

SECRET_KEY = (
    os.environ.get("SECRET_KEY")
    or os.environ.get("DJANGO_SECRET_KEY")
    or "django-insecure-chatapp-development-key-replace-in-prod"
)

DEBUG = os.environ.get("DEBUG", "True").lower() == "true"

_raw_hosts = os.environ.get("ALLOWED_HOSTS", "*")
ALLOWED_HOSTS = [h.strip() for h in _raw_hosts.split()] if _raw_hosts != "*" else ["*"]

# ─── Application Definition ───────────────────────────────────────────────────

INSTALLED_APPS = [
    "daphne",  # Must be first for ASGI
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "channels",
    # Internal apps
    "apps.authentication",
    "apps.chat",
    "apps.messages_app",
    "apps.realtime",
    "apps.preview",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",           # Must be near top
    "django.middleware.gzip.GZipMiddleware",            # Reduce bandwidth
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "apps.authentication.middleware.JWTAuthenticationFromCookieMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "core.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "core.wsgi.application"
ASGI_APPLICATION = "core.asgi.application"

# ─── Database Configuration ───────────────────────────────────────────────────
# DB_ENGINE: postgresql (default) | mysql | sqlite3
#
# Connection strategy:
#   ASGI/Daphne is async — coroutines share a small thread pool.
#   Django's CONN_MAX_AGE keeps one connection alive per OS thread.
#   For async workloads this is the correct approach: each sync DB call
#   runs in a thread via database_sync_to_async, and that thread reuses
#   its persistent connection (no reconnect overhead per request).
#
#   CONN_MAX_AGE=0   → new connection every request (safe but slow)
#   CONN_MAX_AGE=600 → reuse connection for up to 10 minutes per thread
#                      (recommended for Daphne + thread pool)
#
#   CONN_HEALTH_CHECKS=True → Django pings before reuse, drops stale connections
#   automatically (prevents "server closed the connection unexpectedly")

DB_ENGINE = os.environ.get("DB_ENGINE", "mysql").lower().strip()

# 600s = 10 min. Safe default for a small EC2. Reduce if you hit
# "too many connections" errors (lower = connections freed faster).
_conn_max_age = int(os.environ.get("DB_CONN_MAX_AGE", "600"))

# How many connections the thread pool keeps open concurrently.
# Daphne default thread pool = (CPU * 5). On a 1-core t3.micro = 5 threads.
# Keep this comfortably below PostgreSQL's max_connections (default 100).
_db_pool_options: dict = {}

if DB_ENGINE == "sqlite3":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / os.environ.get("SQLITE_PATH", "db.sqlite3"),
        }
    }

elif DB_ENGINE == "mysql":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.mysql",
            "NAME": os.environ.get("MYSQL_DATABASE", "chat_db"),
            "USER": os.environ.get("MYSQL_USER", "chat_user"),
            "PASSWORD": os.environ.get("MYSQL_PASSWORD", "chat_password"),
            "HOST": os.environ.get("MYSQL_HOST", "127.0.0.1"),
            "PORT": os.environ.get("MYSQL_PORT", "3306"),
            "CONN_MAX_AGE": _conn_max_age,
            "CONN_HEALTH_CHECKS": True,
            "OPTIONS": {
                "charset": "utf8mb4",
                "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
                # Keep MySQL connections alive; match server wait_timeout
                "connect_timeout": 10,
            },
        }
    }

else:  # postgresql (default)
    import urllib.parse as _urlparse

    # DATABASE_URL must be set in production via environment / GitHub secret.
    # It is intentionally left with no hardcoded fallback for production safety.
    # For local dev it falls back to the standard local container URL.
    _db_url = os.environ.get(
        "DATABASE_URL",
        "postgresql://chat_user:chat_password@127.0.0.1:5432/chat_db",
    )
    _url = _urlparse.urlparse(_db_url)

    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": _url.path.lstrip("/") or "chat_db",
            "USER": _url.username or "chat_user",
            "PASSWORD": _url.password or "chat_password",
            # Use the host from DATABASE_URL — do NOT hardcode 127.0.0.1
            # so this works both locally and against a remote RDS/Cloud SQL host.
            "HOST": _url.hostname or "127.0.0.1",
            "PORT": str(_url.port or 5432),
            # Persistent connections: reuse the same socket across requests
            # on the same thread — eliminates TCP handshake + auth overhead.
            "CONN_MAX_AGE": _conn_max_age,
            # Auto-detect stale connections (e.g. after server restart or
            # network blip) and reconnect transparently.
            "CONN_HEALTH_CHECKS": True,
            "OPTIONS": {
                # Hard limit per connection attempt — fail fast, don't hang
                "connect_timeout": 10,
                # Keep-alive so idle connections survive NAT/firewall timeouts
                # (avoids "SSL connection has been closed unexpectedly")
                "keepalives": 1,
                "keepalives_idle": 60,    # send first probe after 60s idle
                "keepalives_interval": 10, # probe every 10s after that
                "keepalives_count": 5,    # drop after 5 failed probes
            },
        }
    }

# ─── Auth ─────────────────────────────────────────────────────────────────────

AUTH_USER_MODEL = "authentication.User"

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
    "django.contrib.auth.hashers.BCryptPasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
]

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 8},
    },
]

# ─── Internationalisation ─────────────────────────────────────────────────────

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# ─── Static & Media ───────────────────────────────────────────────────────────

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/api/v1/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ─── CORS ─────────────────────────────────────────────────────────────────────

CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOW_CREDENTIALS = True

_client_url = os.environ.get("CLIENT_URL", "http://localhost:5173")
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]
if _client_url and _client_url not in CORS_ALLOWED_ORIGINS:
    CORS_ALLOWED_ORIGINS.append(_client_url)

# Allow extra CORS origins from env (space-separated)
_extra_origins = os.environ.get("EXTRA_CORS_ORIGINS", "")
for _origin in _extra_origins.split():
    if _origin not in CORS_ALLOWED_ORIGINS:
        CORS_ALLOWED_ORIGINS.append(_origin)

# ─── Django REST Framework ────────────────────────────────────────────────────

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": f"{os.environ.get('API_RATE_LIMIT', '60')}/min",
        "user": f"{os.environ.get('API_RATE_LIMIT', '60')}/min",
        "login": f"{os.environ.get('LOGIN_RATE_LIMIT', '5')}/min",
        "otp": f"{os.environ.get('OTP_RATE_LIMIT', '3')}/min",
    },
    # Never expose stack traces in API responses
    "EXCEPTION_HANDLER": "core.exceptions.custom_exception_handler",
}

# ─── SimpleJWT ────────────────────────────────────────────────────────────────

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(days=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_TOKEN_CLASSES": ("rest_framework_simplejwt.tokens.AccessToken",),
}

# ─── Redis, Channels & Cache ──────────────────────────────────────────────────

REDIS_URL = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/0")

if os.environ.get("USE_REDIS", "False").lower() == "true":
    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": REDIS_URL,
            "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"},
        }
    }
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": [REDIS_URL]},
        },
    }
else:
    # In-memory fallbacks for zero-setup local development
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "chat-app-cache",
        }
    }
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        },
    }

# ─── Celery (Low-Resource Configuration) ─────────────────────────────────────

CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
# Conservative for 1–2 GB RAM machines
CELERY_WORKER_CONCURRENCY = int(os.environ.get("CELERY_CONCURRENCY", 2))
CELERY_WORKER_MAX_TASKS_PER_CHILD = 100
CELERY_WORKER_MAX_MEMORY_PER_CHILD = 150_000  # 150 MB
CELERY_WORKER_PREFETCH_MULTIPLIER = 1

# ─── Email ────────────────────────────────────────────────────────────────────

EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = os.environ.get("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", 587))
EMAIL_USE_TLS = os.environ.get("EMAIL_SECURE", "false").lower() != "true"
EMAIL_USE_SSL = os.environ.get("EMAIL_SECURE", "false").lower() == "true"
EMAIL_HOST_USER = os.environ.get("EMAIL_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_PASS", "")
DEFAULT_FROM_EMAIL = os.environ.get("EMAIL_FROM", EMAIL_HOST_USER)

# ─── Production Security Settings ────────────────────────────────────────────
# These are automatically activated when DEBUG=False

if not DEBUG:
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = "DENY"
    SECURE_HSTS_SECONDS = 31_536_000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    # Only enable SSL redirects if behind HTTPS
    SECURE_SSL_REDIRECT = os.environ.get("FORCE_SSL_REDIRECT", "False").lower() == "true"
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

# ─── Logging ──────────────────────────────────────────────────────────────────

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[{asctime}] {levelname} {name}: {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
        "file": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": BASE_DIR / "logs" / "app.log",
            "maxBytes": 10 * 1024 * 1024,  # 10 MB
            "backupCount": 5,
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
        "apps": {
            "handlers": ["console", "file"] if not DEBUG else ["console"],
            "level": "DEBUG" if DEBUG else "INFO",
            "propagate": False,
        },
    },
}

# Ensure logs directory exists
(BASE_DIR / "logs").mkdir(exist_ok=True)
