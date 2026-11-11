import os
import re
import urllib.parse as urlparse
from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Python 3.15+ Compatibility: Patch Django Context.__copy__ for instrumented test rendering
import copy
import django.template.context as _dtc

def _safe_base_context_copy(self):
    obj = self.__class__.__new__(self.__class__)
    obj.dicts = self.dicts[:]
    return obj

def _safe_context_copy(self):
    obj = self.__class__.__new__(self.__class__)
    obj.dicts = self.dicts[:]
    obj.render_context = copy.copy(self.render_context)
    return obj

_dtc.BaseContext.__copy__ = _safe_base_context_copy
_dtc.Context.__copy__ = _safe_context_copy

# Load environment variables
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY") or os.environ.get("SECRET_KEY") or "django-insecure-chat-app-production-secret-key-replace-in-env"
DEBUG = os.environ.get("DJANGO_DEBUG", "True").lower() in ("true", "1", "yes")

# Allowed Hosts
raw_allowed_hosts = os.environ.get("DJANGO_ALLOWED_HOSTS") or os.environ.get("ALLOWED_HOSTS") or "*"
ALLOWED_HOSTS = [h.strip() for h in raw_allowed_hosts.split(",") if h.strip()]

# Application definition
INSTALLED_APPS = [
    "daphne",  # ASGI server must be first
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party packages
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "channels",
    # Chat system internal apps
    "apps.authentication",
    "apps.chat",
    "apps.messages_app",
    "apps.storage_app",
    "apps.notifications",
    "apps.outbox",
    "apps.realtime",
    "apps.preview",
    "apps.sync_app",
    "apps.status_app",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.gzip.GZipMiddleware",
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

# ─── Database Configuration: Strict MySQL 8+ Engine Exclusively ────────────
try:
    import pymysql
    pymysql.install_as_MySQLdb()
except Exception:
    pass

db_url = os.environ.get("DATABASE_URL", "")
if db_url.startswith("mysql://"):
    parsed = urlparse.urlparse(db_url)
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.mysql",
            "NAME": parsed.path[1:],
            "USER": parsed.username or "chat_user",
            "PASSWORD": parsed.password or "chat_password",
            "HOST": parsed.hostname or "127.0.0.1",
            "PORT": parsed.port or 3306,
            "OPTIONS": {
                "charset": "utf8mb4",
                "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
            },
            "CONN_MAX_AGE": int(os.environ.get("DB_CONN_MAX_AGE", 600)),
            "CONN_HEALTH_CHECKS": True,
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.mysql",
            "NAME": os.environ.get("DATABASE_NAME") or os.environ.get("MYSQL_DATABASE", "chat_db"),
            "USER": os.environ.get("DATABASE_USER") or os.environ.get("MYSQL_USER", "chat_user"),
            "PASSWORD": os.environ.get("DATABASE_PASSWORD") or os.environ.get("MYSQL_PASSWORD", "chat_password"),
            "HOST": os.environ.get("DATABASE_HOST") or os.environ.get("MYSQL_HOST", "127.0.0.1"),
            "PORT": int(os.environ.get("DATABASE_PORT") or os.environ.get("MYSQL_PORT", 3306)),
            "OPTIONS": {
                "charset": "utf8mb4",
                "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
            },
            "CONN_MAX_AGE": int(os.environ.get("DB_CONN_MAX_AGE", 600)),
            "CONN_HEALTH_CHECKS": True,
        }
    }

AUTH_USER_MODEL = "authentication.User"

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
    "django.contrib.auth.hashers.BCryptPasswordHasher",
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# ─── Static & Private File Storage ──────────────────────────────────────────
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/api/v1/media/"
MEDIA_ROOT = BASE_DIR / "media"

STORAGE_ROOT = Path(os.environ.get("STORAGE_ROOT", BASE_DIR / "storage" / "private"))
STORAGE_ROOT.mkdir(parents=True, exist_ok=True)

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ─── CORS & Security Configuration ──────────────────────────────────────────
CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https?://localhost(:[0-9]+)?$",
    r"^https?://127\.0\.0\.1(:[0-9]+)?$",
    r"^capacitor://localhost$",
    r"^ionic://localhost$",
    r"^https?://.*\.chickenkiller\.com$",
    r"^https?://.*\.duckdns\.org$",
    r"^https?://.*\.vercel\.app$",
]

CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://localhost",
    "capacitor://localhost",
]

CSRF_TRUSTED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://localhost",
    "capacitor://localhost",
]

client_url = os.environ.get("CLIENT_URL", "").strip().rstrip("/")
if client_url:
    if client_url not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(client_url)
    if client_url not in CORS_ALLOWED_ORIGINS:
        CORS_ALLOWED_ORIGINS.append(client_url)

public_domain = os.environ.get("PUBLIC_DOMAIN", "").strip()
if public_domain:
    for scheme in ("http://", "https://"):
        origin = f"{scheme}{public_domain}"
        if origin not in CSRF_TRUSTED_ORIGINS:
            CSRF_TRUSTED_ORIGINS.append(origin)
        if origin not in CORS_ALLOWED_ORIGINS:
            CORS_ALLOWED_ORIGINS.append(origin)
    CORS_ALLOWED_ORIGIN_REGEXES.append(rf"^https?://.*{re.escape(public_domain)}$")

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_THROTTLE_CLASSES": [
        "apps.authentication.throttles.ProxySafeAnonRateThrottle",
        "apps.authentication.throttles.ProxySafeUserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/minute",
        "user": "600/minute",
        "otp_request": "6/minute",
        "otp_verify": "10/minute",
        "message_send": "60/minute",
        "file_upload": "30/minute",
        "search": "45/minute",
    },
}

# ─── HTTP Security Headers ──────────────────────────────────────────────────
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True
USE_X_FORWARDED_PORT = True

if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
CSRF_COOKIE_HTTPONLY = True

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(os.environ.get("JWT_ACCESS_MINUTES", 60))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.environ.get("JWT_REFRESH_DAYS", 30))),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_TOKEN_CLASSES": ("rest_framework_simplejwt.tokens.AccessToken",),
}

# ─── Redis, Celery & Channel Layer ──────────────────────────────────────────
REDIS_URL = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/0")
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", REDIS_URL)
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", REDIS_URL)
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"

if os.environ.get("USE_REDIS", "False").lower() in ("true", "1"):
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
            "CONFIG": {
                "hosts": [
                    {
                        "address": REDIS_URL,
                        "socket_timeout": 30,
                    }
                ],
            },
        },
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "chat-local-cache",
        }
    }
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        },
    }

# ─── Email & SMTP Configuration ─────────────────────────────────────────────
EMAIL_HOST = os.environ.get("SMTP_HOST") or os.environ.get("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.environ.get("SMTP_PORT") or os.environ.get("EMAIL_PORT", 587))
EMAIL_USE_TLS = os.environ.get("SMTP_USE_TLS", "True").lower() in ("true", "1")
EMAIL_HOST_USER = (
    os.environ.get("SMTP_USERNAME")
    or os.environ.get("EMAIL_HOST_USER")
    or os.environ.get("EMAIL_USER")
    or ""
)
EMAIL_HOST_PASSWORD = (
    os.environ.get("SMTP_PASSWORD")
    or os.environ.get("EMAIL_HOST_PASSWORD")
    or os.environ.get("EMAIL_APP_PASSWORD")
    or os.environ.get("APP_PASSWORD")
    or os.environ.get("EMAIL_PASS")
    or ""
).replace(" ", "").strip()
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", EMAIL_HOST_USER or "noreply@chatapp.local")

# Automatically use SMTP if host user & app password credentials exist, otherwise fallback to console in debug
default_email_backend = (
    "django.core.mail.backends.smtp.EmailBackend"
    if (EMAIL_HOST_USER and EMAIL_HOST_PASSWORD)
    else ("django.core.mail.backends.console.EmailBackend" if DEBUG else "django.core.mail.backends.smtp.EmailBackend")
)
EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND", default_email_backend)

# ─── OAuth Configurations ───────────────────────────────────────────────────
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")

GITHUB_CLIENT_ID = os.environ.get("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET", "")

FACEBOOK_APP_ID = os.environ.get("FACEBOOK_APP_ID", "")
FACEBOOK_APP_SECRET = os.environ.get("FACEBOOK_APP_SECRET", "")

# ─── Web Push (VAPID) ───────────────────────────────────────────────────────
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_CLAIM_EMAIL = os.environ.get("VAPID_CLAIM_EMAIL", DEFAULT_FROM_EMAIL)

# ─── FCM Direct HTTP v1 ─────────────────────────────────────────────────────
FCM_PROJECT_ID = os.environ.get("FCM_PROJECT_ID", "")
FCM_SERVICE_ACCOUNT_PATH = os.environ.get("FCM_SERVICE_ACCOUNT_PATH", "")

# ─── Public Domain & URLs ───────────────────────────────────────────────────
PUBLIC_DOMAIN = os.environ.get("PUBLIC_DOMAIN", "localhost")
API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000")
WEBSOCKET_URL = os.environ.get("WEBSOCKET_URL", "ws://localhost:8000/ws/chat/")
MEDIA_BASE_URL = os.environ.get("MEDIA_BASE_URL", "http://localhost:8000/api/v1/media/")
