import os
import re
import sys
import urllib.parse as urlparse
from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Python 3.14+ Compatibility: Patch Django Context.__copy__ while preserving full __dict__ attributes
if sys.version_info >= (3, 14):
    import copy
    import django.template.context as _dtc

    def _safe_base_context_copy(self):
        obj = self.__class__.__new__(self.__class__)
        obj.__dict__ = copy.copy(self.__dict__)
        obj.dicts = self.dicts[:]
        return obj

    def _safe_context_copy(self):
        obj = _safe_base_context_copy(self)
        obj.render_context = copy.copy(self.render_context)
        return obj

    _dtc.BaseContext.__copy__ = _safe_base_context_copy
    _dtc.Context.__copy__ = _safe_context_copy

# Load environment variables
load_dotenv(BASE_DIR / ".env")

def _split_csv_env(*names: str) -> list[str]:
    values: list[str] = []
    for name in names:
        raw = os.environ.get(name, "")
        for item in raw.split(","):
            item = item.strip()
            if item and item not in values:
                values.append(item)
    return values


def _extract_hostname(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    parsed = urlparse.urlparse(raw if "://" in raw else f"https://{raw}")
    return (parsed.hostname or "").strip()


SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY") or os.environ.get("SECRET_KEY") or "django-insecure-chat-app-production-secret-key-replace-in-env"
DEBUG = (os.environ.get("DJANGO_DEBUG") or os.environ.get("DEBUG") or "True").lower() in ("true", "1", "yes")

# Deployment Domain & Server IP (loaded from environment / GitHub Actions secrets)
PUBLIC_DOMAIN = os.environ.get("PUBLIC_DOMAIN", "").strip()
SERVER_IP = os.environ.get("SERVER_IP", "").strip()
CLIENT_URL = os.environ.get("CLIENT_URL", "").strip().rstrip("/")
API_BASE_URL = (os.environ.get("API_BASE_URL") or CLIENT_URL or "http://localhost:8000").strip().rstrip("/")
WEBSOCKET_URL = os.environ.get("WEBSOCKET_URL", "ws://localhost:8000/ws/chat/")
MEDIA_BASE_URL = os.environ.get("MEDIA_BASE_URL", "http://localhost:8000/api/v1/media/")

# Allowed Hosts (strictly scoped to configured hosts/IP; never wildcard '*' in production)
ALLOWED_HOSTS = _split_csv_env("DJANGO_ALLOWED_HOSTS", "ALLOWED_HOSTS")
if not ALLOWED_HOSTS:
    ALLOWED_HOSTS = ["127.0.0.1", "localhost", "[::1]", "testserver"] if DEBUG else ["127.0.0.1", "localhost"]

for _host_candidate in (
    _extract_hostname(PUBLIC_DOMAIN),
    _extract_hostname(SERVER_IP),
    _extract_hostname(CLIENT_URL),
    _extract_hostname(API_BASE_URL),
):
    if _host_candidate and _host_candidate not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(_host_candidate)

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

_MYSQL_OPTIONS = {
    "charset": "utf8mb4",
    "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
    "connect_timeout": int(os.environ.get("DB_CONNECT_TIMEOUT", "5")),
    "read_timeout": int(os.environ.get("DB_READ_TIMEOUT", "15")),
    "write_timeout": int(os.environ.get("DB_WRITE_TIMEOUT", "15")),
}

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
            "OPTIONS": dict(_MYSQL_OPTIONS),
            "CONN_MAX_AGE": int(os.environ.get("DB_CONN_MAX_AGE", 120)),
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
            "OPTIONS": dict(_MYSQL_OPTIONS),
            "CONN_MAX_AGE": int(os.environ.get("DB_CONN_MAX_AGE", 120)),
            "CONN_HEALTH_CHECKS": True,
        }
    }

AUTH_USER_MODEL = "authentication.User"

PASSWORD_HASHERS = [
    "apps.authentication.hashers.FastBCryptSHA256PasswordHasher",
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
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

# Capacitor / Ionic native app WebView origins (always local shell schemes)
_BASE_TRUSTED_ORIGINS = [
    "https://localhost",
    "capacitor://localhost",
    "ionic://localhost",
]
if DEBUG:
    _BASE_TRUSTED_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        *_BASE_TRUSTED_ORIGINS,
    ]
    CORS_ALLOWED_ORIGIN_REGEXES = [
        r"^https?://localhost(:[0-9]+)?$",
        r"^https?://127\.0\.0\.1(:[0-9]+)?$",
        r"^capacitor://localhost$",
        r"^ionic://localhost$",
    ]
else:
    CORS_ALLOWED_ORIGIN_REGEXES = [
        r"^capacitor://localhost$",
        r"^ionic://localhost$",
    ]


def _append_unique_origin(origin_list: list[str], origin: str) -> None:
    cleaned = (origin or "").strip().rstrip("/")
    if not cleaned:
        return
    if cleaned not in origin_list:
        origin_list.append(cleaned)


CORS_ALLOWED_ORIGINS = list(_BASE_TRUSTED_ORIGINS)
CSRF_TRUSTED_ORIGINS = list(_BASE_TRUSTED_ORIGINS)

for _extra_cors in _split_csv_env("CORS_ALLOWED_ORIGINS"):
    _append_unique_origin(CORS_ALLOWED_ORIGINS, _extra_cors)

for _extra_csrf in _split_csv_env("CSRF_TRUSTED_ORIGINS"):
    _append_unique_origin(CSRF_TRUSTED_ORIGINS, _extra_csrf)

for _explicit_url in (CLIENT_URL, os.environ.get("API_BASE_URL", "")):
    _parsed_explicit = urlparse.urlparse(_explicit_url.strip()) if _explicit_url.strip() else None
    if _parsed_explicit and _parsed_explicit.scheme in ("http", "https") and _parsed_explicit.netloc:
        _norm_origin = f"{_parsed_explicit.scheme}://{_parsed_explicit.netloc}"
        _append_unique_origin(CORS_ALLOWED_ORIGINS, _norm_origin)
        _append_unique_origin(CSRF_TRUSTED_ORIGINS, _norm_origin)

if PUBLIC_DOMAIN:
    _domain_schemes = ("http://", "https://") if DEBUG else ("https://",)
    for _scheme in _domain_schemes:
        _origin = f"{_scheme}{PUBLIC_DOMAIN}" if "://" not in PUBLIC_DOMAIN else PUBLIC_DOMAIN
        _append_unique_origin(CORS_ALLOWED_ORIGINS, _origin)
        _append_unique_origin(CSRF_TRUSTED_ORIGINS, _origin)

if SERVER_IP:
    for _scheme in ("http://", "https://"):
        _ip_origin = f"{_scheme}{SERVER_IP}"
        _append_unique_origin(CORS_ALLOWED_ORIGINS, _ip_origin)
        _append_unique_origin(CSRF_TRUSTED_ORIGINS, _ip_origin)

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "apps.authentication.middleware.SessionValidatedJWTAuthentication",
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
        "password_login": "120/minute",
        "otp_request": "6/minute",
        "otp_verify": "10/minute",
        "mfa_verify": "15/minute",
        "qr_create": "30/minute",
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
    SECURE_REDIRECT_EXEMPT = [r"^$", r"^hello/?$", r"^health/?$", r"^ready/?$", r"^api/v1/(health|ready)/?$"]
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
CSRF_COOKIE_HTTPONLY = True
CSRF_FAILURE_VIEW = "core.urls.custom_csrf_failure"

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(os.environ.get("JWT_ACCESS_MINUTES", 60))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.environ.get("JWT_REFRESH_DAYS", 30))),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_TOKEN_CLASSES": ("rest_framework_simplejwt.tokens.AccessToken",),
}

# Maximum simultaneous active device sessions allowed per user (prevents unlimited shared logins)
MAX_ACTIVE_SESSIONS_PER_USER = int(os.environ.get("MAX_ACTIVE_SESSIONS_PER_USER", 3))

# ─── Redis, Celery & Channel Layer ──────────────────────────────────────────
REDIS_URL = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/0")
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", REDIS_URL)
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", REDIS_URL)
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"

if os.environ.get("USE_REDIS", "False").lower() in ("true", "1"):
    _CPU_COUNT = os.cpu_count() or 2
    _REDIS_CACHE_MAX_CONNS = int(
        os.environ.get("REDIS_CACHE_MAX_CONNS", str(min(256, max(64, _CPU_COUNT * 32))))
    )
    _CHANNEL_REDIS_MAX_CONNS = int(
        os.environ.get("CHANNEL_REDIS_MAX_CONNS", str(min(512, max(128, _CPU_COUNT * 64))))
    )
    _CHANNEL_CAPACITY = int(os.environ.get("CHANNEL_CAPACITY", "10000"))
    _CHANNEL_EXPIRY = int(os.environ.get("CHANNEL_EXPIRY", "20"))
    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": REDIS_URL,
            "OPTIONS": {
                "CLIENT_CLASS": "django_redis.client.DefaultClient",
                "CONNECTION_POOL_KWARGS": {
                    "max_connections": _REDIS_CACHE_MAX_CONNS,
                    "retry_on_timeout": True,
                },
                "SOCKET_CONNECT_TIMEOUT": 2,
                "SOCKET_TIMEOUT": 2,
            },
        }
    }
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [
                    {
                        "address": REDIS_URL,
                        "socket_timeout": 10,
                        "max_connections": _CHANNEL_REDIS_MAX_CONNS,
                    }
                ],
                "capacity": _CHANNEL_CAPACITY,
                "expiry": _CHANNEL_EXPIRY,
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
