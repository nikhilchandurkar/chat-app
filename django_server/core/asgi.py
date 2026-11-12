import os
from concurrent.futures import ThreadPoolExecutor
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
from apps.realtime.routing import websocket_urlpatterns
from apps.realtime.middleware import WebSocketJWTAuthMiddleware

_CPU_COUNT = os.cpu_count() or 2
_ASGI_POOL_WORKERS = int(
    os.environ.get("ASGI_THREADPOOL_WORKERS", str(min(128, max(32, _CPU_COUNT * 16))))
)
_ASGI_IO_EXECUTOR = ThreadPoolExecutor(
    max_workers=_ASGI_POOL_WORKERS,
    thread_name_prefix="asgi_io",
)
_EXECUTOR_INSTALLED = False

django_http_app = get_asgi_application()

_base_application = ProtocolTypeRouter({
    "http": django_http_app,
    "websocket": AllowedHostsOriginValidator(
        WebSocketJWTAuthMiddleware(
            URLRouter(websocket_urlpatterns)
        )
    ),
})


async def application(scope, receive, send):
    global _EXECUTOR_INSTALLED
    if not _EXECUTOR_INSTALLED:
        import asyncio
        try:
            asyncio.get_running_loop().set_default_executor(_ASGI_IO_EXECUTOR)
        except Exception:
            pass
        _EXECUTOR_INSTALLED = True
    await _base_application(scope, receive, send)

