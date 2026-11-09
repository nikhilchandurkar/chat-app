import os
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from django.db import connection
from django.views.static import serve
from apps.outbox.services.redis_streams import get_redis_client


def health_check(request):
    """Liveness probe endpoint."""
    return JsonResponse({
        "status": "healthy",
        "service": "chat-backend",
        "version": "2.0.0",
    })


def hello_view(request):
    """Quick greeting endpoint."""
    return JsonResponse({"status": "ok", "message": "hello from nikki"}, safe=False)


def ready_check(request):
    """Readiness probe checking MySQL and Redis connectivity."""
    checks = {}

    # Check Database
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            row = cursor.fetchone()
            checks["database"] = "connected" if row and row[0] == 1 else "unexpected_result"
    except Exception as e:
        checks["database"] = f"error: {str(e)}"

    # Check Redis
    r = get_redis_client()
    if r:
        try:
            r.ping()
            checks["redis"] = "connected"
        except Exception as e:
            checks["redis"] = f"error: {str(e)}"
    else:
        checks["redis"] = "not_available"

    is_ready = checks.get("database") == "connected"
    status_code = 200 if is_ready else 503

    return JsonResponse({
        "status": "ready" if is_ready else "degraded",
        "checks": checks,
    }, status=status_code)


urlpatterns = [
    # Probes and Hello
    path("", health_check, name="root"),
    path("hello", hello_view, name="hello"),
    path("hello/", hello_view, name="hello-slash"),
    path("health", health_check, name="health"),
    path("health/", health_check, name="health-slash"),
    path("ready", ready_check, name="ready"),
    path("ready/", ready_check, name="ready-slash"),
    path("api/v1/health", health_check, name="api-health"),
    path("api/v1/health/", health_check, name="api-health-slash"),
    path("api/v1/ready", ready_check, name="api-ready"),
    path("api/v1/ready/", ready_check, name="api-ready-slash"),

    # Django Admin
    path("admin/", admin.site.urls),

    # Application APIs
    path("api/v1/auth/", include("apps.authentication.urls_auth")),
    path("api/v1/user/", include("apps.authentication.urls")),
    path("api/v1/chat/", include("apps.chat.urls")),
    path("api/v1/message/", include("apps.messages_app.urls")),
    # Storage and Streaming Downloads
    path("api/v1/status/", include("apps.status_app.urls")),
    path("api/v1/storage/", include("apps.storage_app.urls")),
    path("api/v1/notifications/", include("apps.notifications.urls")),
    path("api/v1/sync/", include("apps.sync_app.urls")),
    path("api/v1/preview/", include("apps.preview.urls")),
    path("api/v1/admin/", include("apps.authentication.urls_admin")),
]

urlpatterns += [
    re_path(r"^api/v1/media/(?P<path>.*)$", serve, {"document_root": settings.MEDIA_ROOT}),
]
