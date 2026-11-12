import time
from rest_framework.throttling import SimpleRateThrottle


def get_client_ip(request):
    """Safely extracts client IP address accounting for proxies/load balancers."""
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


class ProxySafeAnonRateThrottle(SimpleRateThrottle):
    scope = "anon"

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            return None  # Only throttle anonymous requests
        ip = get_client_ip(request)
        return self.cache_format % {"scope": self.scope, "ident": ip or "127.0.0.1"}


class ProxySafeUserRateThrottle(SimpleRateThrottle):
    scope = "user"

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            return self.cache_format % {"scope": self.scope, "ident": request.user.pk}
        ip = get_client_ip(request)
        return self.cache_format % {"scope": "anon", "ident": ip or "127.0.0.1"}


class OTPRequestThrottle(SimpleRateThrottle):
    scope = "otp_request"

    def get_cache_key(self, request, view):
        ip = get_client_ip(request)
        email = request.data.get("email", "").strip().lower() if hasattr(request, "data") else ""
        ident = f"{ip}_{email}" if email else ip
        return self.cache_format % {"scope": self.scope, "ident": ident or "anon"}


class OTPVerifyThrottle(SimpleRateThrottle):
    scope = "otp_verify"

    def get_cache_key(self, request, view):
        ip = get_client_ip(request)
        email = request.data.get("email", "").strip().lower() if hasattr(request, "data") else ""
        ident = f"{ip}_{email}" if email else ip
        return self.cache_format % {"scope": self.scope, "ident": ident or "anon"}


class MessageSendThrottle(SimpleRateThrottle):
    scope = "message_send"

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            return self.cache_format % {"scope": self.scope, "ident": request.user.pk}
        return None


class FileUploadThrottle(SimpleRateThrottle):
    scope = "file_upload"

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            return self.cache_format % {"scope": self.scope, "ident": request.user.pk}
        return None


class SearchThrottle(SimpleRateThrottle):
    scope = "search"

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            return self.cache_format % {"scope": self.scope, "ident": request.user.pk}
        ip = get_client_ip(request)
        return self.cache_format % {"scope": self.scope, "ident": ip or "anon"}


class PasswordLoginThrottle(SimpleRateThrottle):
    scope = "password_login"

    def get_cache_key(self, request, view):
        ip = get_client_ip(request)
        identifier = ""
        if hasattr(request, "data") and isinstance(request.data, dict):
            identifier = str(request.data.get("username") or "").strip().lower()
        ident = f"{ip}_{identifier}" if identifier else (ip or "anon")
        return self.cache_format % {"scope": self.scope, "ident": ident}


class MFAVerifyThrottle(SimpleRateThrottle):
    scope = "mfa_verify"

    def get_cache_key(self, request, view):
        ip = get_client_ip(request)
        return self.cache_format % {"scope": self.scope, "ident": ip or "anon"}


class QRCreateThrottle(SimpleRateThrottle):
    scope = "qr_create"

    def get_cache_key(self, request, view):
        ip = get_client_ip(request)
        return self.cache_format % {"scope": self.scope, "ident": ip or "anon"}
