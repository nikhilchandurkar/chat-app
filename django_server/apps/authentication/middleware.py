import jwt
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.tokens import AccessToken

from apps.authentication.services.session_service import SessionService

User = get_user_model()


class SessionValidatedJWTAuthentication(JWTAuthentication):
    """DRF JWT authenticator that enforces session revocation via `sid` and reuses middleware verification."""

    def authenticate(self, request):
        django_req = getattr(request, "_request", request)
        prevalidated = getattr(django_req, "_prevalidated_jwt", None)
        raw_header = self.get_header(request)
        if raw_header is not None:
            raw_token = self.get_raw_token(raw_header)
        else:
            raw_token = django_req.COOKIES.get("chitChat-Token")
            if isinstance(raw_token, str):
                raw_token = raw_token.encode("utf-8")

        if prevalidated is not None and raw_token is not None:
            cached_raw, cached_user, cached_tok = prevalidated
            if cached_raw == raw_token and getattr(cached_user, "is_authenticated", False):
                sid = cached_tok.get("sid")
                if sid:
                    request.current_session_id = str(sid)
                return cached_user, cached_tok

        result = super().authenticate(request)
        if result is None:
            return None
        user, validated_token = result
        sid = validated_token.get("sid")
        if sid and SessionService.is_session_revoked(str(sid)):
            raise InvalidToken("Session has been revoked.")
        if sid:
            request.current_session_id = str(sid)
        return user, validated_token


class JWTAuthenticationFromCookieMiddleware:
    """
    Extracts the JWT token from the 'chitChat-Token' cookie or Bearer header,
    enforces immediate session revocation via `sid`, and attaches `request.user`.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.current_session_id = None
        request._prevalidated_jwt = None
        token = request.COOKIES.get("chitChat-Token")

        # Support Authorization: Bearer <token> for mobile/API clients
        if not token:
            auth_header = request.META.get("HTTP_AUTHORIZATION", "")
            if auth_header.startswith("Bearer "):
                token = auth_header.split(" ", 1)[1].strip()

        if token:
            try:
                validated_token = AccessToken(token)
                sid = validated_token.get("sid")
                if sid and SessionService.is_session_revoked(str(sid)):
                    request.user = AnonymousUser()
                    return self.get_response(request)
                request.current_session_id = str(sid) if sid else None
                user_id = validated_token.get("user_id") or validated_token.get("_id")
                if user_id:
                    user_obj = (
                        User.objects.only(
                            "id", "username", "name", "email", "avatar",
                            "status", "role", "is_active", "is_staff", "is_superuser", "privacy",
                        )
                        .filter(id=user_id, is_active=True)
                        .first()
                    )
                    request.user = user_obj or AnonymousUser()
                    if user_obj is not None:
                        request._prevalidated_jwt = (token.encode("utf-8"), user_obj, validated_token)
            except Exception:
                # If SimpleJWT fails, try decoding with raw JWT_SECRET (for backward compatibility with Node JWTs)
                try:
                    raw_secret = getattr(settings, "JWT_SECRET", "chat_app_secret")
                    decoded = jwt.decode(token, raw_secret, algorithms=["HS256"])
                    user_id = decoded.get("_id") or decoded.get("user_id")
                    if user_id:
                        request.user = (
                            User.objects.only(
                                "id", "username", "name", "email", "avatar",
                                "status", "role", "is_active", "is_staff", "is_superuser", "privacy",
                            )
                            .filter(id=user_id, is_active=True)
                            .first()
                            or AnonymousUser()
                        )
                except Exception:
                    pass

        return self.get_response(request)

