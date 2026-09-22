import jwt
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import AccessToken

User = get_user_model()

class JWTAuthenticationFromCookieMiddleware:
    """
    Extracts the JWT token from the 'chitChat-Token' cookie and attaches the user
    to request.user so standard Django/DRF views automatically recognize the session.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = request.COOKIES.get("chitChat-Token")

        # Support Authorization: Bearer <token> for React Native mobile clients
        if not token:
            auth_header = request.headers.get("Authorization") or request.META.get("HTTP_AUTHORIZATION", "")
            if auth_header.startswith("Bearer "):
                token = auth_header.split(" ", 1)[1].strip()

        if token:
            try:
                validated_token = AccessToken(token)
                user_id = validated_token.get("user_id") or validated_token.get("_id")
                if user_id:
                    request.user = User.objects.filter(id=user_id).first() or AnonymousUser()
            except Exception:
                # If SimpleJWT fails, try decoding with raw JWT_SECRET (for backward compatibility with Node JWTs)
                try:
                    raw_secret = getattr(settings, "JWT_SECRET", "chat_app_secret")
                    decoded = jwt.decode(token, raw_secret, algorithms=["HS256"])
                    user_id = decoded.get("_id") or decoded.get("user_id")
                    if user_id:
                        request.user = User.objects.filter(id=user_id).first() or AnonymousUser()
                except Exception:
                    pass

        return self.get_response(request)

