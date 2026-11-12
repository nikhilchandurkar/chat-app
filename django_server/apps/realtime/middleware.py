from urllib.parse import parse_qs
from channels.db import DatabaseSyncToAsync
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken

from apps.authentication.models import User
from apps.authentication.services.session_service import SessionService


def db_async(func):
    """Runs synchronous DB lookups across the worker threadpool without single-thread serialization."""
    return DatabaseSyncToAsync(func, thread_sensitive=False)


@db_async
def get_user_from_token(token_str):
    try:
        access_token = AccessToken(token_str)
        sid = access_token.get("sid")
        if sid and SessionService.is_session_revoked(str(sid)):
            return AnonymousUser()
        user_id = access_token.get("user_id")
        return (
            User.objects.select_related("profile")
            .only(
                "id", "username", "name", "avatar", "status", "is_active",
                "profile__privacy_online", "profile__privacy_last_seen",
                "profile__privacy_read_receipts", "profile__privacy_typing_indicator",
            )
            .get(id=user_id, is_active=True)
        )
    except Exception:
        return AnonymousUser()


class WebSocketJWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        cookies = scope.get("cookies", {})
        token = cookies.get("chitChat-Token")

        # Fallback 1: query param ?token=...
        if not token:
            query_string = scope.get("query_string", b"").decode("utf-8")
            params = parse_qs(query_string)
            token = params.get("token", [None])[0]

        # Fallback 2: Authorization header for React Native WebSocket clients
        if not token:
            headers = dict(scope.get("headers", []))
            auth_header = headers.get(b"authorization", b"").decode("utf-8")
            if auth_header.startswith("Bearer "):
                token = auth_header.split(" ", 1)[1].strip()

        if token:
            scope["user"] = await get_user_from_token(token)
        else:
            scope["user"] = AnonymousUser()

        return await super().__call__(scope, receive, send)

