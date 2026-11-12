import os
from urllib.parse import quote, urlencode, urlparse
from django.http import HttpResponseRedirect
from django.utils import timezone
from django.db import transaction
from django.db.models import Exists, OuterRef, Q
from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.core.mail import send_mail
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated

from .models import User, UserProfile, Contact, Request, SocialAccount, BlockedUser, Report, AuditLog, Device, UserSession
from .throttles import (
    MFAVerifyThrottle,
    OTPRequestThrottle,
    OTPVerifyThrottle,
    PasswordLoginThrottle,
    QRCreateThrottle,
    SearchThrottle,
    get_client_ip,
)
from rest_framework_simplejwt.tokens import RefreshToken as SimpleRefreshToken
from .serializers import (
    UserSerializer,
    UserProfileSerializer,
    PasswordLoginSerializer,
    RegisterRequestSerializer,
    RegisterVerifySerializer,
    RequestOTPSerializer,
    VerifyOTPSerializer,
    GoogleAuthSerializer,
    GitHubAuthSerializer,
    FacebookAuthSerializer,
    SocialAccountSerializer,
    DeviceRegisterSerializer,
    SessionSerializer,
    FriendRequestSerializer,
    MFACodeSerializer,
    MFADisableSerializer,
    MFALoginVerifySerializer,
    QRApproveSerializer,
    QRClaimSerializer,
    QRCreateSerializer,
    ResolveDeviceLimitSerializer,
    ForgotPasswordOTPResetSerializer,
)
from .services.mfa_service import MFAService
from .services.otp_service import OTPService
from .services.oauth_service import OAuthService
from .services.qr_service import QRAuthService
from .services.session_service import SessionService


def _session_conflict_response(message: str, data: dict) -> Response:
    return Response({
        "success": False,
        "code": data.get("code", "DEVICE_LIMIT_REACHED"),
        "message": message,
        "max_devices": data.get("max_devices"),
        "active_sessions": data.get("active_sessions", []),
        "deviceLimitToken": data.get("device_limit_token"),
    }, status=status.HTTP_409_CONFLICT)


def _mfa_challenge_response(data: dict) -> Response:
    return Response({
        "success": True,
        "mfaRequired": True,
        "mfaToken": data.get("mfa_token"),
        "methods": data.get("methods", ["totp", "backup_code"]),
        "message": "Enter your 6-digit authenticator code or a backup recovery code.",
    })


def set_jwt_cookie(response, access_token: str, refresh_token: str = None):
    """Sets secure HttpOnly cookie for Web and attaches token to response body for React Native."""
    response.set_cookie(
        key="chitChat-Token",
        value=access_token,
        max_age=30 * 24 * 60 * 60,
        httponly=True,
        samesite="Lax" if settings.DEBUG else "None",
        secure=not settings.DEBUG,
    )
    if isinstance(response.data, dict):
        response.data["token"] = access_token
        if refresh_token:
            response.data["refreshToken"] = refresh_token


# ─── Public Auth Configuration ───────────────────────────────────────────────
def _is_allowed_oauth_redirect_uri(redirect_uri: str, request) -> bool:
    if not redirect_uri:
        return False
    try:
        parsed = urlparse(redirect_uri)
    except Exception:
        return False
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return False
    if parsed.path not in ("/login", "/login/"):
        return False

    origin = f"{parsed.scheme}://{parsed.netloc}".lower()
    allowed_origins = {
        o.strip().rstrip("/").lower()
        for o in (
            list(getattr(settings, "CORS_ALLOWED_ORIGINS", []))
            + list(getattr(settings, "CSRF_TRUSTED_ORIGINS", []))
            + [getattr(settings, "API_BASE_URL", "")]
        )
        if o and "*" not in o
    }
    request_origin = f"{request.scheme}://{request.get_host()}".lower()
    allowed_origins.add(request_origin)
    if origin in allowed_origins:
        return True

    hostname = (parsed.hostname or "").lower()
    if parsed.scheme == "https" and (
        hostname.endswith(".duckdns.org") or hostname == getattr(settings, "PUBLIC_DOMAIN", "").lower()
    ):
        return True
    return False


class AuthConfigView(APIView):
    """Returns non-sensitive OAuth availability flags without exposing client IDs."""
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({
            "success": True,
            "google_enabled": bool(getattr(settings, "GOOGLE_CLIENT_ID", "")),
            "github_enabled": bool(getattr(settings, "GITHUB_CLIENT_ID", "")),
            "facebook_enabled": bool(getattr(settings, "FACEBOOK_APP_ID", "")),
        })


class OAuthAuthorizeStartView(APIView):
    """Builds and redirects to provider OAuth server-side so client IDs stay off UI/JS."""
    permission_classes = [AllowAny]

    def get(self, request, provider: str):
        provider_key = (provider or "").strip().lower()
        if provider_key not in ("google", "github"):
            return Response(
                {"success": False, "message": "Unsupported OAuth provider."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        platform = (request.query_params.get("platform") or "web").strip().lower()
        default_base = (getattr(settings, "API_BASE_URL", "") or f"{request.scheme}://{request.get_host()}").rstrip("/")
        redirect_uri = (request.query_params.get("redirect_uri") or f"{default_base}/login").strip()

        if not _is_allowed_oauth_redirect_uri(redirect_uri, request):
            return Response(
                {"success": False, "message": "Invalid OAuth redirect URI."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        state = f"{provider_key}_android" if platform == "android" else provider_key

        if provider_key == "google":
            client_id = getattr(settings, "GOOGLE_CLIENT_ID", "")
            if not client_id:
                return Response(
                    {"success": False, "message": "Google Sign-In is not configured on the server."},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            query = urlencode({
                "response_type": "code",
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "scope": "openid email profile",
                "access_type": "offline",
                "prompt": "select_account",
                "state": state,
            })
            return HttpResponseRedirect(f"https://accounts.google.com/o/oauth2/v2/auth?{query}")

        client_id = getattr(settings, "GITHUB_CLIENT_ID", "")
        if not client_id:
            return Response(
                {"success": False, "message": "GitHub Sign-In is not configured on the server."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        query = urlencode({
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": "user:email",
            "state": state,
        })
        return HttpResponseRedirect(f"https://github.com/login/oauth/authorize?{query}")


# ─── Username / Email + Password Login ──────────────────────────────────────
class PasswordLoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PasswordLoginThrottle]

    def post(self, request):
        serializer = PasswordLoginSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "message": "Username/email and password are required.", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        identifier = serializer.validated_data["username"].strip()
        password = serializer.validated_data["password"]
        device_id = serializer.validated_data.get("device_id", "web-client")
        device_name = serializer.validated_data.get("device_name", "")
        platform = serializer.validated_data.get("platform", "web")
        app_version = serializer.validated_data.get("app_version", "1.0.0")
        replace_session_id = serializer.validated_data.get("replace_session_id", "").strip() or None

        user = User.objects.select_related("profile", "mfa").filter(
            Q(username__iexact=identifier) | Q(email__iexact=identifier)
        ).first()

        if not user or not user.check_password(password):
            return Response({"success": False, "message": "Invalid username or password."}, status=status.HTTP_401_UNAUTHORIZED)

        if not user.is_active:
            return Response({"success": False, "message": "Your account has been deactivated. Please contact support."}, status=status.HTTP_403_FORBIDDEN)

        if MFAService.is_mfa_enabled(user):
            mfa_token = MFAService.issue_login_challenge(
                user=user,
                auth_method="password",
                device_id=device_id,
                platform=platform,
                app_version=app_version,
                device_name=device_name,
            )
            return _mfa_challenge_response({"mfa_token": mfa_token, "methods": ["totp", "backup_code"]})

        ok, sess_msg, sess_data = SessionService.create_enforced_session_and_tokens(
            user=user,
            device_id=device_id,
            platform=platform,
            app_version=app_version,
            device_name=device_name,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            auth_method="password",
            replace_session_id=replace_session_id,
            audit_action="LOGIN_SUCCESS",
        )
        if not ok:
            return _session_conflict_response(sess_msg, sess_data)

        response = Response({
            "success": True,
            "message": f"Welcome back, {user.name or user.username}!",
            "user": UserSerializer(user).data,
            "session_id": sess_data["session_id"],
            "token": sess_data["access"],
            "refreshToken": sess_data["refresh"],
        })
        set_jwt_cookie(response, sess_data["access"], sess_data["refresh"])
        return response


# ─── Registration with Email OTP Verification ───────────────────────────────
class RegisterRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [OTPRequestThrottle]

    def post(self, request):
        serializer = RegisterRequestSerializer(data=request.data)
        if not serializer.is_valid():
            first_err = next(iter(serializer.errors.values()))[0] if serializer.errors else "Invalid registration details."
            return Response({"success": False, "message": first_err, "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        username = serializer.validated_data["username"].strip()
        email = serializer.validated_data["email"].lower().strip()
        password = serializer.validated_data["password"]
        confirm_password = serializer.validated_data["confirm_password"]

        if password != confirm_password:
            return Response({"success": False, "message": "Passwords do not match."}, status=status.HTTP_400_BAD_REQUEST)

        if len(password) < 8:
            return Response({"success": False, "message": "Password must be at least 8 characters long."}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(username__iexact=username).exists():
            return Response({"success": False, "message": "This username is already taken. Please choose another."}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(email__iexact=email).exists():
            return Response({"success": False, "message": "An account with this email address already exists."}, status=status.HTTP_400_BAD_REQUEST)

        ip = get_client_ip(request)
        success, message = OTPService.request_otp(email, purpose="register", ip_address=ip)
        if not success:
            return Response({"success": False, "message": message}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        return Response({
            "success": True,
            "message": f"Verification code sent to {email}. Please enter the 6-digit code to complete registration.",
        })


class RegisterVerifyView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [OTPVerifyThrottle]

    def post(self, request):
        serializer = RegisterVerifySerializer(data=request.data)
        if not serializer.is_valid():
            first_err = next(iter(serializer.errors.values()))[0] if serializer.errors else "Invalid verification details."
            return Response({"success": False, "message": first_err, "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        username = serializer.validated_data["username"].strip()
        email = serializer.validated_data["email"].lower().strip()
        password = serializer.validated_data["password"]
        otp = serializer.validated_data["otp"].strip()
        name = serializer.validated_data.get("name", "").strip() or username
        device_id = serializer.validated_data.get("device_id", "web-client")
        platform = serializer.validated_data.get("platform", "web")
        app_version = serializer.validated_data.get("app_version", "1.0.0")

        # 1. Verify OTP code
        success, message = OTPService.verify_otp_only(email=email, otp=otp, purpose="register")
        if not success:
            return Response({"success": False, "message": message}, status=status.HTTP_400_BAD_REQUEST)

        # 2. Race condition check for username/email
        if User.objects.filter(username__iexact=username).exists():
            return Response({"success": False, "message": "Username was taken while verifying. Please choose another username."}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(email__iexact=email).exists():
            return Response({"success": False, "message": "Email was registered while verifying."}, status=status.HTTP_400_BAD_REQUEST)

        # 3. Create user in database
        with transaction.atomic():
            user = User.objects.create_user(
                email=email,
                username=username,
                password=password,
                name=name,
                role="user",
                is_active=True,
            )
            user.status = "online"
            user.save(update_fields=["status"])

            # Create or ensure UserProfile
            UserProfile.objects.get_or_create(
                user=user,
                defaults={"display_name": name or username}
            )

            # Device & Session
            now = timezone.now()
            device, _ = Device.objects.update_or_create(
                user=user,
                device_id=device_id,
                defaults={
                    "platform": platform,
                    "app_version": app_version,
                    "is_active": True,
                    "last_active_at": now,
                }
            )

            ok, _sess_msg, sess_data = SessionService.create_enforced_session_and_tokens(
                user=user,
                device_id=device_id,
                platform=platform,
                app_version=app_version,
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                auth_method="email_otp_register",
                audit_action="REGISTER_SUCCESS",
            )
            access_token = sess_data["access"]
            refresh_token = sess_data["refresh"]

        response = Response({
            "success": True,
            "message": "Account created successfully! Welcome to ChitChat.",
            "user": UserSerializer(user).data,
            "session_id": sess_data.get("session_id"),
            "token": access_token,
            "refreshToken": refresh_token,
        }, status=status.HTTP_201_CREATED)
        set_jwt_cookie(response, access_token, refresh_token)
        return response


# ─── Passwordless Email OTP Authentication ──────────────────────────────────
class RequestOTPView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [OTPRequestThrottle]

    def post(self, request):
        serializer = RequestOTPSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "message": "A valid email address is required."}, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data["email"]
        purpose = serializer.validated_data.get("purpose", "login")
        ip = get_client_ip(request)

        success, message = OTPService.request_otp(email, purpose=purpose, ip_address=ip)
        if not success:
            return Response({"success": False, "message": message}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        return Response({"success": True, "message": message})


class VerifyOTPView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [OTPVerifyThrottle]

    def post(self, request):
        serializer = VerifyOTPSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "message": "Valid email and 6-digit code are required."}, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data["email"]
        otp = serializer.validated_data["otp"]
        device_id = serializer.validated_data.get("device_id", "web-client")
        device_name = serializer.validated_data.get("device_name", "")
        platform = serializer.validated_data.get("platform", "web")
        app_version = serializer.validated_data.get("app_version", "1.0.0")
        replace_session_id = serializer.validated_data.get("replace_session_id", "").strip() or None
        ip = get_client_ip(request)
        ua = request.META.get("HTTP_USER_AGENT", "")

        success, message, data = OTPService.verify_otp(
            email=email,
            otp=otp,
            device_id=device_id,
            platform=platform,
            app_version=app_version,
            ip_address=ip,
            user_agent=ua,
            device_name=device_name,
            replace_session_id=replace_session_id,
        )

        if not success:
            if data.get("code") == "DEVICE_LIMIT_REACHED":
                return _session_conflict_response(message, data)
            return Response({"success": False, "message": message}, status=status.HTTP_400_BAD_REQUEST)

        if data.get("mfa_required"):
            return _mfa_challenge_response(data)

        response = Response({
            "success": True,
            "message": message,
            "user": data["user"],
            "session_id": data["session_id"],
        })
        set_jwt_cookie(response, data["tokens"]["access"], data["tokens"]["refresh"])
        return response


class AccountRecoveryView(APIView):
    """
    Secure passwordless account recovery via email OTP.
    Invalidates all prior active sessions and refresh tokens on other devices.
    """
    permission_classes = [AllowAny]
    throttle_classes = [OTPVerifyThrottle]

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        otp = request.data.get("otp", "").strip()
        device_id = request.data.get("device_id", "web-recovery")
        platform = request.data.get("platform", "web")
        ip = get_client_ip(request)
        ua = request.META.get("HTTP_USER_AGENT", "")

        if not email or not otp:
            return Response({"success": False, "message": "Email and 6-digit recovery code are required."}, status=status.HTTP_400_BAD_REQUEST)

        success, message, data = OTPService.recover_account(
            email=email,
            otp=otp,
            device_id=device_id,
            platform=platform,
            ip_address=ip,
            user_agent=ua
        )
        if not success:
            return Response({"success": False, "message": message}, status=status.HTTP_400_BAD_REQUEST)

        response = Response({
            "success": True,
            "message": message,
            "user": data.get("user"),
            "session_id": data.get("session_id"),
        })
        if "tokens" in data:
            set_jwt_cookie(response, data["tokens"]["access"], data["tokens"]["refresh"])
        return response


# ─── Social OAuth Authentication & Linking ──────────────────────────────────
class GoogleAuthView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = GoogleAuthSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "message": "id_token or code is required.", "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        id_token = serializer.validated_data.get("id_token")
        code = serializer.validated_data.get("code")
        redirect_uri = serializer.validated_data.get("redirect_uri", "")
        device_id = serializer.validated_data.get("device_id", "google-client")
        platform = serializer.validated_data.get("platform", "web")
        app_version = serializer.validated_data.get("app_version", "1.0.0")

        try:
            if code:
                profile = OAuthService.exchange_google_code(code, redirect_uri)
            elif id_token:
                profile = OAuthService.verify_google_token(id_token)
            else:
                return Response({"success": False, "message": "Either id_token or code is required."}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({"success": False, "message": "Google verification failed. Please try again."}, status=status.HTTP_400_BAD_REQUEST)

        current_user = request.user if request.user.is_authenticated else None
        success, message, data = OAuthService.authenticate_or_link_social(
            provider="google",
            profile_data=profile,
            current_user=current_user,
            device_id=device_id,
            platform=platform,
            app_version=app_version,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", "")
        )

        if not success:
            if data.get("code") == "DEVICE_LIMIT_REACHED":
                return _session_conflict_response(message, data)
            return Response({"success": False, "message": message}, status=status.HTTP_400_BAD_REQUEST)

        if data.get("mfa_required"):
            return _mfa_challenge_response(data)

        response = Response({"success": True, "message": message, "user": data.get("user"), "session_id": data.get("session_id")})
        if "tokens" in data:
            set_jwt_cookie(response, data["tokens"]["access"], data["tokens"]["refresh"])
        return response


class GitHubAuthView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = GitHubAuthSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "message": "code is required."}, status=status.HTTP_400_BAD_REQUEST)

        code = serializer.validated_data["code"]
        redirect_uri = serializer.validated_data.get("redirect_uri", "")
        device_id = serializer.validated_data.get("device_id", "github-client")
        platform = serializer.validated_data.get("platform", "web")
        app_version = serializer.validated_data.get("app_version", "1.0.0")

        try:
            profile = OAuthService.exchange_github_code(code, redirect_uri)
        except Exception:
            return Response({"success": False, "message": "GitHub verification failed. Please try again."}, status=status.HTTP_400_BAD_REQUEST)

        current_user = request.user if request.user.is_authenticated else None
        success, message, data = OAuthService.authenticate_or_link_social(
            provider="github",
            profile_data=profile,
            current_user=current_user,
            device_id=device_id,
            platform=platform,
            app_version=app_version,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", "")
        )

        if not success:
            if data.get("code") == "DEVICE_LIMIT_REACHED":
                return _session_conflict_response(message, data)
            return Response({"success": False, "message": message}, status=status.HTTP_400_BAD_REQUEST)

        if data.get("mfa_required"):
            return _mfa_challenge_response(data)

        response = Response({"success": True, "message": message, "user": data.get("user"), "session_id": data.get("session_id")})
        if "tokens" in data:
            set_jwt_cookie(response, data["tokens"]["access"], data["tokens"]["refresh"])
        return response


class FacebookAuthView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = FacebookAuthSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "message": "access_token is required."}, status=status.HTTP_400_BAD_REQUEST)

        access_token = serializer.validated_data["access_token"]
        device_id = serializer.validated_data.get("device_id", "facebook-client")
        platform = serializer.validated_data.get("platform", "web")
        app_version = serializer.validated_data.get("app_version", "1.0.0")

        try:
            profile = OAuthService.verify_facebook_token(access_token)
        except Exception:
            return Response({"success": False, "message": "Facebook verification failed. Please try again."}, status=status.HTTP_400_BAD_REQUEST)

        current_user = request.user if request.user.is_authenticated else None
        success, message, data = OAuthService.authenticate_or_link_social(
            provider="facebook",
            profile_data=profile,
            current_user=current_user,
            device_id=device_id,
            platform=platform,
            app_version=app_version,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", "")
        )

        if not success:
            if data.get("code") == "DEVICE_LIMIT_REACHED":
                return _session_conflict_response(message, data)
            return Response({"success": False, "message": message}, status=status.HTTP_400_BAD_REQUEST)

        if data.get("mfa_required"):
            return _mfa_challenge_response(data)

        response = Response({"success": True, "message": message, "user": data.get("user"), "session_id": data.get("session_id")})
        if "tokens" in data:
            set_jwt_cookie(response, data["tokens"]["access"], data["tokens"]["refresh"])
        return response


class LinkedProvidersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        accounts = SocialAccount.objects.filter(user=request.user)
        return Response({
            "success": True,
            "providers": SocialAccountSerializer(accounts, many=True).data
        })


class UnlinkProviderView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        provider = request.data.get("provider", "").lower().strip()
        success, message = OAuthService.unlink_provider(request.user, provider)
        if not success:
            return Response({"success": False, "message": message}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"success": True, "message": message})


# ─── Refresh Token & Session Management ─────────────────────────────────────
class RefreshTokenView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        token_str = request.data.get("refreshToken") or request.COOKIES.get("chitChat-RefreshToken")
        if not token_str:
            return Response({"success": False, "message": "Refresh token is required."}, status=status.HTTP_400_BAD_REQUEST)

        success, message, tokens = SessionService.rotate_refresh_token(token_str)
        if not success:
            return Response({"success": False, "message": message}, status=status.HTTP_401_UNAUTHORIZED)

        response = Response({"success": True, "message": message, "tokens": tokens})
        set_jwt_cookie(response, tokens["access"], tokens["refresh"])
        return response


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        sid = getattr(request, "current_session_id", None)
        if sid:
            SessionService.revoke_session(request.user, sid)
        response = Response({"success": True, "message": "Logged out successfully."})
        response.delete_cookie("chitChat-Token")
        response.delete_cookie("chitChat-RefreshToken")
        return response


class UserSessionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sid = getattr(request, "current_session_id", None)
        sessions = SessionService.get_user_sessions(request.user, current_session_id=sid)
        return Response({
            "success": True,
            "sessions": sessions,
            "active_count": len(sessions),
            "max_devices": SessionService.get_max_devices(),
        })


class RevokeOtherSessionsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        sid = getattr(request, "current_session_id", None)
        revoked = SessionService.revoke_all_other_sessions(request.user, keep_session_id=sid)
        return Response({
            "success": True,
            "revoked_count": revoked,
            "message": f"Signed out of {revoked} other device(s).",
        })


class ResolveDeviceLimitView(APIView):
    """Completes login after user chooses an existing device session to evict."""
    permission_classes = [AllowAny]
    throttle_classes = [MFAVerifyThrottle]

    def post(self, request):
        serializer = ResolveDeviceLimitSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "message": "Device limit token and session ID are required."}, status=status.HTTP_400_BAD_REQUEST)

        payload = SessionService.consume_device_limit_token(serializer.validated_data["device_limit_token"])
        if not payload:
            return Response({"success": False, "message": "Session selection expired. Please sign in again."}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.select_related("profile", "mfa").filter(id=payload.get("user_id"), is_active=True).first()
        if not user:
            return Response({"success": False, "message": "User account unavailable."}, status=status.HTTP_404_NOT_FOUND)

        linked_parent = None
        if payload.get("linked_by_session_id"):
            linked_parent = UserSession.objects.filter(id=payload["linked_by_session_id"]).first()

        ok, msg, sess_data = SessionService.create_enforced_session_and_tokens(
            user=user,
            device_id=payload.get("device_id", "web-client"),
            platform=payload.get("platform", "web"),
            app_version=payload.get("app_version", "1.0.0"),
            device_name=payload.get("device_name", ""),
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            auth_method=payload.get("auth_method", "password"),
            linked_by_session=linked_parent,
            replace_session_id=serializer.validated_data["replace_session_id"],
            audit_action="LOGIN_DEVICE_REPLACED",
        )
        if not ok:
            return _session_conflict_response(msg, sess_data)

        response = Response({
            "success": True,
            "message": f"Welcome back, {user.name or user.username}!",
            "user": UserSerializer(user).data,
            "session_id": sess_data["session_id"],
        })
        set_jwt_cookie(response, sess_data["access"], sess_data["refresh"])
        return response


class RevokeSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, session_id):
        success = SessionService.revoke_session(request.user, session_id)
        if not success:
            return Response({"success": False, "message": "Session not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response({"success": True, "message": "Session revoked."})


class RegisterDeviceView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = DeviceRegisterSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        device = SessionService.register_device(
            user=request.user,
            device_id=serializer.validated_data["device_id"],
            platform=serializer.validated_data["platform"],
            app_version=serializer.validated_data.get("app_version", "1.0.0"),
            native_fcm_token=serializer.validated_data.get("native_fcm_token", ""),
        )
        return Response({"success": True, "device_id": device.device_id, "message": "Device registered."})


# ─── Profile Management ─────────────────────────────────────────────────────
class GetMyProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = User.objects.select_related("profile", "mfa").filter(pk=request.user.pk).first() or request.user
        return Response({
            "success": True,
            "user": UserSerializer(user).data
        })


class PublicUserProfileView(APIView):
    """Returns a user's privacy-filtered public profile plus relationship metadata."""
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        from django.core.exceptions import ValidationError as DjangoValidationError
        from apps.chat.models import Conversation

        try:
            target = User.objects.select_related("profile").filter(id=user_id, is_active=True).first()
        except (ValueError, DjangoValidationError):
            target = None

        if not target:
            return Response({"success": False, "message": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        is_self = target.id == request.user.id
        is_blocked = (not is_self) and BlockedUser.objects.filter(user=request.user, blocked_user=target).exists()
        has_blocked_me = (not is_self) and BlockedUser.objects.filter(user=target, blocked_user=request.user).exists()

        direct_conv = None
        if not is_self:
            direct_conv = (
                Conversation.objects.filter(type="direct", member_records__user=request.user)
                .filter(member_records__user=target)
                .first()
            )

        is_contact = bool(direct_conv) or (
            not is_self and Contact.objects.filter(user=target, contact_user=request.user).exists()
        )

        # Relationship status
        relationship = "self" if is_self else ("friends" if direct_conv else "none")
        pending_request_id = None
        if not is_self and relationship != "friends":
            accepted_req = Request.objects.filter(
                (Q(sender=request.user, receiver=target) | Q(sender=target, receiver=request.user)),
                status="accepted",
            ).first()
            if accepted_req:
                relationship = "friends"
                is_contact = True
            else:
                sent_req = Request.objects.filter(sender=request.user, receiver=target, status="pending").first()
                if sent_req:
                    relationship = "sent"
                    pending_request_id = str(sent_req.id)
                else:
                    recv_req = Request.objects.filter(sender=target, receiver=request.user, status="pending").first()
                    if recv_req:
                        relationship = "received"
                        pending_request_id = str(recv_req.id)

        profile = getattr(target, "profile", None)
        blocked_either = is_blocked or has_blocked_me

        def _can_view(setting):
            if is_self:
                return True
            if blocked_either:
                return False
            val = str(setting or "everyone").lower()
            if val == "nobody":
                return False
            if val in ("contacts", "friends"):
                return is_contact
            return True

        avatar_allowed = _can_view(getattr(profile, "privacy_avatar", "everyone"))
        online_allowed = _can_view(getattr(profile, "privacy_online", "everyone"))
        last_seen_allowed = _can_view(getattr(profile, "privacy_last_seen", "everyone"))
        bio_allowed = _can_view((target.privacy or {}).get("profile", "everyone"))

        raw_avatar = target.avatar.get("url") if isinstance(target.avatar, dict) else None
        avatar_payload = {"url": raw_avatar} if (avatar_allowed and raw_avatar) else None
        bio_text = (getattr(profile, "about", "") or target.bio or "") if bio_allowed else ""

        shared_groups = []
        if not is_self and not blocked_either:
            shared_qs = (
                Conversation.objects.filter(group_chat=True, member_records__user=request.user)
                .filter(member_records__user=target)
                .distinct()
                .order_by("-updated_at")[:10]
            )
            for grp in shared_qs:
                grp_avatar = grp.avatar.get("url") if isinstance(grp.avatar, dict) else None
                shared_groups.append({
                    "_id": str(grp.id),
                    "name": grp.name or "Group Chat",
                    "avatar": grp_avatar,
                })

        last_seen_iso = None
        if last_seen_allowed and profile and profile.last_seen:
            last_seen_iso = profile.last_seen.isoformat()

        return Response({
            "success": True,
            "user": {
                "_id": str(target.id),
                "id": str(target.id),
                "name": target.name or target.username,
                "username": target.username,
                "bio": bio_text,
                "avatar": avatar_payload,
                "status": target.status if online_allowed else "hidden",
                "lastSeen": last_seen_iso,
                "createdAt": target.created_at.isoformat() if target.created_at else None,
                "isSelf": is_self,
                "isBlocked": is_blocked,
                "hasBlockedMe": has_blocked_me,
                "relationship": relationship,
                "pendingRequestId": pending_request_id,
                "directChatId": str(direct_conv.id) if direct_conv else None,
                "sharedGroups": shared_groups,
                "e2eePublicKey": (target.privacy or {}).get("e2ee_public_key"),
                "e2eeFingerprint": (target.privacy or {}).get("e2ee_fingerprint"),
            },
        })


class E2EEKeyView(APIView):
    """Publishes or retrieves public ECDH (P-256) JWK keys for client-side E2EE. Private keys never touch the server."""
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id=None):
        if user_id:
            from django.core.exceptions import ValidationError as DjangoValidationError
            try:
                target = User.objects.filter(id=user_id, is_active=True).first()
            except (ValueError, DjangoValidationError):
                target = None
            if not target:
                return Response({"success": False, "message": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        else:
            target = request.user

        priv = dict(target.privacy or {})
        return Response({
            "success": True,
            "userId": str(target.id),
            "publicKey": priv.get("e2ee_public_key"),
            "fingerprint": priv.get("e2ee_fingerprint", ""),
            "updatedAt": priv.get("e2ee_updated_at"),
        })

    def put(self, request):
        jwk = request.data.get("publicKey")
        fingerprint = str(request.data.get("fingerprint", "")).strip()[:128]
        if not isinstance(jwk, dict) or jwk.get("kty") != "EC" or jwk.get("crv") != "P-256" or not jwk.get("x") or not jwk.get("y"):
            return Response({"success": False, "message": "Valid ECDH P-256 public JWK is required."}, status=status.HTTP_400_BAD_REQUEST)
        if "d" in jwk:
            return Response({"success": False, "message": "Private key material ('d') must never be uploaded."}, status=status.HTTP_400_BAD_REQUEST)

        clean_jwk = {
            "kty": "EC",
            "crv": "P-256",
            "x": str(jwk["x"]),
            "y": str(jwk["y"]),
            "ext": True,
        }
        user_priv = dict(request.user.privacy or {})
        user_priv["e2ee_public_key"] = clean_jwk
        user_priv["e2ee_fingerprint"] = fingerprint
        user_priv["e2ee_updated_at"] = timezone.now().isoformat()
        request.user.privacy = user_priv
        request.user.save(update_fields=["privacy"])
        return Response({
            "success": True,
            "publicKey": clean_jwk,
            "fingerprint": fingerprint,
            "updatedAt": user_priv["e2ee_updated_at"],
        })


class UpdateProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        user = request.user
        name = request.data.get("name")
        bio = request.data.get("bio")
        username = request.data.get("username")

        if username and username.lower() != user.username:
            clean_username = username.lower().strip()
            if User.objects.filter(username=clean_username).exclude(id=user.id).exists():
                return Response({"success": False, "message": "Username already taken."}, status=status.HTTP_400_BAD_REQUEST)
            user.username = clean_username

        if name:
            user.name = name.strip()
        if bio is not None:
            user.bio = bio.strip()

        # Handle avatar file upload
        if "avatar" in request.FILES:
            avatar_file = request.FILES["avatar"]
            from django.core.files.storage import default_storage
            filename = default_storage.save(f"avatars/{user.id}_{avatar_file.name}", avatar_file)
            user.avatar = {
                "public_id": filename,
                "url": f"/api/v1/media/{filename}"
            }

        user.save()

        # Update profile
        profile, _ = UserProfile.objects.get_or_create(user=user)
        if "display_name" in request.data:
            profile.display_name = request.data["display_name"].strip()
        if "about" in request.data:
            profile.about = request.data["about"].strip()
        profile.save()

        return Response({
            "success": True,
            "message": "Profile updated successfully.",
            "user": UserSerializer(user).data
        })

    def delete(self, request):
        return _deactivate_profile_response(request.user)


def _deactivate_profile_response(user):
    """Shared account deactivation helper for DeleteProfileView and UpdateProfileView."""
    user.is_active = False
    user.save(update_fields=["is_active"])
    response = Response({"success": True, "message": "Account deactivated."})
    response.delete_cookie("chitChat-Token")
    response.delete_cookie("chitChat-RefreshToken")
    return response


class DeleteProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        return _deactivate_profile_response(request.user)


class UpdateStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        status_val = request.data.get("status", "online")
        if status_val not in dict(User.STATUS_CHOICES):
            return Response({"success": False, "message": "Invalid status value."}, status=status.HTTP_400_BAD_REQUEST)

        request.user.status = status_val
        request.user.save(update_fields=["status"])
        return Response({"success": True, "status": status_val})


class UpdatePrivacyView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if "profile" in request.data:
            raw_val = str(request.data["profile"]).strip().lower()
            if raw_val in ("everyone", "friends", "contacts", "nobody"):
                user_privacy = dict(request.user.privacy or {})
                user_privacy["profile"] = raw_val
                request.user.privacy = user_privacy
                request.user.save(update_fields=["privacy"])
                profile.privacy_avatar = "contacts" if raw_val == "friends" else raw_val

        for field in [
            "privacy_avatar", "privacy_online", "privacy_last_seen",
            "hide_from_search", "privacy_read_receipts", "privacy_typing_indicator",
            "who_can_add_to_groups", "who_can_message_me"
        ]:
            if field in request.data:
                setattr(profile, field, request.data[field])
        profile.save()
        return Response({
            "success": True,
            "privacy": UserProfileSerializer(profile).data,
            "user_privacy": request.user.privacy,
        })


class ChangePasswordView(APIView):
    """Updates an authenticated user's password after verifying their current password."""
    permission_classes = [IsAuthenticated]

    def put(self, request):
        current_password = request.data.get("currentPassword") or request.data.get("current_password") or ""
        new_password = request.data.get("newPassword") or request.data.get("new_password") or ""

        if len(new_password) < 8:
            return Response(
                {"success": False, "message": "Password must be at least 8 characters long."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        if user.has_usable_password() and not user.check_password(current_password):
            return Response(
                {"success": False, "message": "Current password is incorrect."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(new_password)
        user.save(update_fields=["password"])
        AuditLog.objects.create(
            user=user,
            action="PASSWORD_CHANGED",
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:255],
        )
        return Response({"success": True, "message": "Password changed successfully."})


class ForgotPasswordView(APIView):
    """Issues a single-use password reset token and dispatches the reset link by email."""
    permission_classes = [AllowAny]
    throttle_classes = [OTPRequestThrottle]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        if not email:
            return Response({"success": False, "message": "Email address is required."}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user:
            uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
            token = f"{uidb64}:{default_token_generator.make_token(user)}"
            client_base = getattr(settings, "API_BASE_URL", "https://chat-nikkiii.duckdns.org").rstrip("/")
            reset_url = f"{client_base}/reset-password?token={quote(token)}&email={quote(user.email)}"
            try:
                from .tasks import send_reset_password_email_task
                send_reset_password_email_task.delay(user.email, reset_url, user.name or user.username)
            except Exception:
                send_mail(
                    subject="Reset Your ChatApp Password",
                    message=f"Reset link (expires in 1 hour): {reset_url}",
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[user.email],
                    fail_silently=True,
                )

        return Response({
            "success": True,
            "message": "If an account exists with that email, a password reset link has been sent.",
        })


class ResetPasswordView(APIView):
    """Validates a password reset token, updates password, and issues fresh JWT credentials."""
    permission_classes = [AllowAny]
    throttle_classes = [OTPVerifyThrottle]

    def post(self, request):
        raw_token = (request.data.get("token") or "").strip()
        email = (request.data.get("email") or "").strip().lower()
        new_password = request.data.get("newPassword") or request.data.get("new_password") or ""

        if not raw_token or ":" not in raw_token or len(new_password) < 8:
            return Response(
                {"success": False, "message": "Invalid reset link or password shorter than 8 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        uidb64, token = raw_token.split(":", 1)
        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.filter(pk=uid, email__iexact=email, is_active=True).first()
        except Exception:
            user = None

        if not user or not default_token_generator.check_token(user, token):
            return Response(
                {"success": False, "message": "Reset link is invalid or expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(new_password)
        user.status = "online"
        user.save(update_fields=["password", "status"])

        jwt_token = SimpleRefreshToken.for_user(user)
        access_token = str(jwt_token.access_token)
        refresh_token = str(jwt_token)

        response = Response({
            "success": True,
            "message": "Password reset successfully.",
            "user": UserSerializer(user).data,
            "token": access_token,
            "refreshToken": refresh_token,
        })
        set_jwt_cookie(response, access_token, refresh_token)
        return response


class ForgotPasswordOTPRequestView(APIView):
    """Dispatches a 6-digit password reset OTP email without revealing account existence."""
    permission_classes = [AllowAny]
    throttle_classes = [OTPRequestThrottle]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        if not email or "@" not in email:
            return Response(
                {"success": False, "message": "A valid email address is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user_exists = User.objects.filter(email__iexact=email, is_active=True).exists()
        if user_exists:
            ok, msg = OTPService.request_otp(email, purpose="recovery", ip_address=get_client_ip(request))
            if not ok:
                return Response({"success": False, "message": msg}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        return Response({
            "success": True,
            "message": "If an account exists with that email, a 6-digit password reset code has been sent.",
        })


class ForgotPasswordOTPResetView(APIView):
    """Verifies a 6-digit email recovery OTP, resets password, revokes old sessions, and signs in."""
    permission_classes = [AllowAny]
    throttle_classes = [OTPVerifyThrottle]

    def post(self, request):
        serializer = ForgotPasswordOTPResetSerializer(data=request.data)
        if not serializer.is_valid():
            first_err = next(iter(serializer.errors.values()))[0] if serializer.errors else "Invalid reset details."
            return Response({"success": False, "message": first_err}, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data["email"].strip().lower()
        otp = serializer.validated_data["otp"].strip()
        new_password = serializer.validated_data["new_password"]
        device_id = serializer.validated_data.get("device_id", "web-client")
        device_name = serializer.validated_data.get("device_name", "")
        platform = serializer.validated_data.get("platform", "web")
        app_version = serializer.validated_data.get("app_version", "1.0.0")
        replace_session_id = serializer.validated_data.get("replace_session_id", "").strip() or None

        ok, msg = OTPService.verify_otp_only(email=email, otp=otp, purpose="recovery")
        if not ok:
            return Response({"success": False, "message": msg}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.select_related("profile", "mfa").filter(email__iexact=email, is_active=True).first()
        if not user:
            return Response({"success": False, "message": "Account unavailable."}, status=status.HTTP_404_NOT_FOUND)

        ip = get_client_ip(request)
        ua = request.META.get("HTTP_USER_AGENT", "")
        with transaction.atomic():
            user.set_password(new_password)
            user.status = "online"
            user.save(update_fields=["password", "status"])
            SessionService.revoke_all_other_sessions(user)
            AuditLog.objects.create(
                user=user,
                action="auth.password_reset_otp",
                ip_address=ip,
                user_agent=ua[:255],
                details={"revoked_prior_sessions": True},
            )

        if MFAService.is_mfa_enabled(user):
            mfa_token = MFAService.issue_login_challenge(
                user=user,
                auth_method="password_reset",
                device_id=device_id,
                platform=platform,
                app_version=app_version,
                device_name=device_name,
            )
            return _mfa_challenge_response({"mfa_token": mfa_token, "methods": ["totp", "backup_code"]})

        sess_ok, sess_msg, sess_data = SessionService.create_enforced_session_and_tokens(
            user=user,
            device_id=device_id,
            platform=platform,
            app_version=app_version,
            device_name=device_name,
            ip_address=ip,
            user_agent=ua,
            auth_method="password",
            replace_session_id=replace_session_id,
            audit_action="LOGIN_AFTER_RESET",
        )
        if not sess_ok:
            return _session_conflict_response(sess_msg, sess_data)

        response = Response({
            "success": True,
            "message": "Password reset successfully.",
            "user": UserSerializer(user).data,
            "session_id": sess_data["session_id"],
        })
        set_jwt_cookie(response, sess_data["access"], sess_data["refresh"])
        return response


def _get_relationships_map(viewer, targets):
    """Computes viewer -> target relationship metadata ('friends' | 'sent' | 'received' | 'none') in batch."""
    from apps.chat.models import ConversationMember

    target_ids = [t.id for t in targets if t and t.id != viewer.id]
    rel_map = {str(tid): {"relationship": "none", "pendingRequestId": None} for tid in target_ids}
    if not target_ids:
        return rel_map

    direct_conv_ids = ConversationMember.objects.filter(
        user=viewer,
        conversation__type="direct",
    ).values_list("conversation_id", flat=True)
    dm_peer_ids = set(
        ConversationMember.objects.filter(
            conversation_id__in=direct_conv_ids,
            user_id__in=target_ids,
        ).values_list("user_id", flat=True)
    )
    for uid in dm_peer_ids:
        rel_map[str(uid)] = {"relationship": "friends", "pendingRequestId": None}

    reqs = Request.objects.filter(
        (Q(sender=viewer, receiver_id__in=target_ids) | Q(sender_id__in=target_ids, receiver=viewer)),
        status__in=["accepted", "pending"],
    ).order_by("-created_at")

    for req in reqs:
        peer_id = str(req.receiver_id if req.sender_id == viewer.id else req.sender_id)
        entry = rel_map.get(peer_id)
        if not entry or entry["relationship"] == "friends":
            continue
        if req.status == "accepted":
            rel_map[peer_id] = {"relationship": "friends", "pendingRequestId": None}
        elif req.status == "pending":
            if req.sender_id == viewer.id and entry["relationship"] == "none":
                rel_map[peer_id] = {"relationship": "sent", "pendingRequestId": str(req.id)}
            elif req.receiver_id == viewer.id:
                rel_map[peer_id] = {"relationship": "received", "pendingRequestId": str(req.id)}

    return rel_map


class SearchUserView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [SearchThrottle]

    def get(self, request):
        query = request.query_params.get("name", "").strip()
        if not query:
            return Response({"success": True, "users": []})

        base_qs = (
            User.objects.select_related("profile")
            .filter(is_active=True)
            .exclude(id=request.user.id)
            .filter(
                ~Exists(BlockedUser.objects.filter(user=request.user, blocked_user_id=OuterRef("pk"))),
                ~Exists(BlockedUser.objects.filter(user_id=OuterRef("pk"), blocked_user=request.user)),
                ~Exists(UserProfile.objects.filter(user_id=OuterRef("pk"), hide_from_search=True)),
            )
        )

        # Indexed prefix lookup first; only fall back to mid-string & fuzzy similarity match
        users = list(base_qs.filter(Q(username__istartswith=query) | Q(name__istartswith=query)).order_by("name")[:20])
        if len(users) < 5:
            seen_ids = {u.id for u in users}
            mid_hits = base_qs.filter(Q(name__icontains=query) | Q(username__icontains=query)).order_by("name")[:20]
            for u in mid_hits:
                if u.id not in seen_ids:
                    users.append(u)
                    seen_ids.add(u.id)

        if len(users) < 5 and len(query) >= 2:
            from apps.messages_app.interactive import fuzzy_match_score

            seen_ids = {u.id for u in users}
            candidates = base_qs[:250]
            fuzzy_ranked = []
            for cand in candidates:
                if cand.id in seen_ids:
                    continue
                score = max(
                    fuzzy_match_score(query, cand.name or ""),
                    fuzzy_match_score(query, cand.username or ""),
                )
                if score >= 0.56:
                    fuzzy_ranked.append((score, cand))
            fuzzy_ranked.sort(key=lambda item: item[0], reverse=True)
            for _, cand in fuzzy_ranked[: max(0, 20 - len(users))]:
                users.append(cand)

        rel_map = _get_relationships_map(request.user, users)
        serialized_users = UserSerializer(users, many=True).data
        for item in serialized_users:
            rel_info = rel_map.get(str(item.get("_id") or item.get("id")), {})
            item["relationship"] = rel_info.get("relationship", "none")
            item["pendingRequestId"] = rel_info.get("pendingRequestId")

        return Response({
            "success": True,
            "users": serialized_users,
        })


# ─── Social / Contacts / Blocks / Reports ───────────────────────────────────
class SendFriendRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        user_id = request.data.get("userId")
        if not user_id:
            return Response({"success": False, "message": "userId is required."}, status=status.HTTP_400_BAD_REQUEST)

        target = User.objects.filter(id=user_id, is_active=True).first()
        if not target or target == request.user:
            return Response({"success": False, "message": "Target user not found or invalid."}, status=status.HTTP_400_BAD_REQUEST)

        if BlockedUser.objects.filter(
            Q(user=request.user, blocked_user=target) | Q(user=target, blocked_user=request.user)
        ).exists():
            return Response({"success": False, "message": "Cannot send friend request to this user."}, status=status.HTTP_403_FORBIDDEN)

        rel_info = _get_relationships_map(request.user, [target]).get(str(target.id), {})
        rel = rel_info.get("relationship", "none")
        if rel == "friends":
            return Response({"success": False, "message": "You are already friends with this user."}, status=status.HTTP_400_BAD_REQUEST)
        if rel == "sent":
            return Response({"success": False, "message": "Request already sent."}, status=status.HTTP_400_BAD_REQUEST)
        if rel == "received":
            return Response(
                {"success": False, "message": "This user already sent you a friend request. Accept it in notifications."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        req, _created = Request.objects.get_or_create(
            sender=request.user,
            receiver=target,
            defaults={"status": "pending"}
        )
        if req.status != "pending":
            req.status = "pending"
            req.save(update_fields=["status"])
        return Response({"success": True, "message": "Friend request sent."})


class AcceptFriendRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        request_id = request.data.get("requestId")
        accept = request.data.get("accept", True)

        req = Request.objects.filter(id=request_id, receiver=request.user).first()
        if not req:
            return Response({"success": False, "message": "Request not found."}, status=status.HTTP_404_NOT_FOUND)

        if accept:
            if req.status != "accepted":
                req.status = "accepted"
                req.save(update_fields=["status"])
            # Keep any opposite-direction pending request in sync
            Request.objects.filter(sender=request.user, receiver=req.sender, status="pending").update(status="accepted")
            # Create a 1-to-1 conversation if one does not exist
            from apps.chat.models import Conversation, ConversationMember
            conv = Conversation.objects.filter(
                type="direct",
                member_records__user=request.user
            ).filter(member_records__user=req.sender).first()

            if not conv:
                conv = Conversation.objects.create(type="direct", creator=request.user)
                ConversationMember.objects.create(conversation=conv, user=request.user, role="member")
                ConversationMember.objects.create(conversation=conv, user=req.sender, role="member")

            return Response({"success": True, "message": "Friend request accepted.", "senderId": str(req.sender.id)})
        else:
            req.status = "rejected"
            req.save(update_fields=["status"])
            return Response({"success": True, "message": "Friend request rejected."})


class GetNotificationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        pending_requests = Request.objects.filter(receiver=request.user, status="pending").select_related("sender")
        return Response({
            "success": True,
            "allRequests": FriendRequestSerializer(pending_requests, many=True).data
        })


class GetMyFriendsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Friends are users connected via accepted requests or 1-to-1 conversations
        from apps.chat.models import ConversationMember
        conv_ids = ConversationMember.objects.filter(
            user=request.user,
            conversation__type="direct"
        ).values_list("conversation_id", flat=True)

        friend_user_ids = ConversationMember.objects.filter(
            conversation_id__in=conv_ids
        ).exclude(user=request.user).values_list("user_id", flat=True)

        friends = User.objects.filter(id__in=friend_user_ids)
        return Response({
            "success": True,
            "friends": UserSerializer(friends, many=True).data
        })


class ToggleStarMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        from apps.messages_app.models import StarredMessage, Message
        msg = Message.objects.select_related("conversation").filter(id=id).first()
        if not msg:
            return Response({"success": False, "message": "Message not found."}, status=status.HTTP_404_NOT_FOUND)

        # IDOR Authorization: User MUST be a member of the conversation this message belongs to!
        if not msg.conversation.member_records.filter(user=request.user).exists():
            return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        starred = StarredMessage.objects.filter(user=request.user, message=msg).first()
        if starred:
            starred.delete()
            is_starred = False
        else:
            StarredMessage.objects.create(user=request.user, message=msg)
            is_starred = True

        return Response({"success": True, "isStarred": is_starred})


class GetStarredMessagesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.messages_app.models import StarredMessage
        from apps.messages_app.serializers import MessageSerializer
        starred = StarredMessage.objects.filter(user=request.user).select_related("message", "message__sender")
        messages = [s.message for s in starred]
        return Response({
            "success": True,
            "messages": MessageSerializer(messages, many=True).data
        })


class BlockUserView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        target = User.objects.filter(id=user_id).first()
        if not target or target == request.user:
            return Response({"success": False, "message": "Invalid user to block."}, status=status.HTTP_400_BAD_REQUEST)

        BlockedUser.objects.get_or_create(user=request.user, blocked_user=target)
        return Response({"success": True, "message": f"Blocked {target.username}."})

    def delete(self, request, user_id):
        BlockedUser.objects.filter(user=request.user, blocked_user_id=user_id).delete()
        return Response({"success": True, "message": "User unblocked."})


class GetBlockedUsersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        blocked = BlockedUser.objects.filter(user=request.user).select_related("blocked_user")
        users = [b.blocked_user for b in blocked]
        return Response({
            "success": True,
            "blockedUsers": UserSerializer(users, many=True).data
        })


class ReportUserView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user_id = request.data.get("userId")
        reason = request.data.get("reason", "").strip()
        if not user_id or not reason:
            return Response({"success": False, "message": "userId and reason are required."}, status=status.HTTP_400_BAD_REQUEST)

        target = User.objects.filter(id=user_id).first()
        if not target:
            return Response({"success": False, "message": "Target user not found."}, status=status.HTTP_404_NOT_FOUND)

        Report.objects.create(reporter=request.user, reported_user=target, reason=reason)
        return Response({"success": True, "message": "Report submitted."})


# ─── Data Privacy & Account Management (GDPR/Compliance) ───────────────────
class ExportUserDataView(APIView):
    """Exports authenticated user's account, profile, devices, and sessions."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        profile = getattr(user, "profile", None)
        devices = list(user.devices.values("device_id", "platform", "app_version", "last_active_at", "created_at"))
        sessions = list(user.sessions.filter(is_revoked=False).values("id", "ip_address", "user_agent", "created_at", "expires_at"))

        export_data = {
            "account": {
                "id": str(user.id),
                "email": user.email,
                "username": user.username,
                "name": user.name,
                "created_at": user.created_at.isoformat(),
            },
            "profile": {
                "display_name": profile.display_name if profile else "",
                "about": profile.about if profile else "",
                "privacy_avatar": profile.privacy_avatar if profile else "everyone",
                "privacy_online": profile.privacy_online if profile else "everyone",
                "privacy_last_seen": profile.privacy_last_seen if profile else "everyone",
                "hide_from_search": profile.hide_from_search if profile else False,
            },
            "devices": devices,
            "sessions": sessions,
            "export_timestamp": timezone.now().isoformat(),
        }
        return Response({"success": True, "data": export_data})


class DeleteAccountView(APIView):
    """Secure account deactivation and data erasure per user privacy request."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        confirm = request.data.get("confirm", False)
        if not confirm:
            return Response({"success": False, "message": "Account deletion requires explicit confirmation."}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        email = user.email
        name = user.name or user.username

        with transaction.atomic():
            SessionService.mark_user_sessions_revoked(user)
            user.is_active = False
            user.save(update_fields=["is_active"])

            AuditLog.objects.create(
                user=user,
                action="auth.account_deleted",
                ip_address=get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                details={"status": "deactivated"}
            )

        from apps.authentication.services.email_service import EmailNotificationService
        EmailNotificationService.send_account_deleted(email=email, user_name=name)

        response = Response({"success": True, "message": "Your account has been deactivated and scheduled for deletion."})
        response.delete_cookie("chitChat-Token")
        return response


# ─── Multi-Factor Authentication (TOTP & Backup Recovery Codes) ─────────────
class MFAStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"success": True, **MFAService.get_status(request.user)})


class MFASetupView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        setup_data = MFAService.begin_setup(request.user)
        return Response({"success": True, **setup_data})


class MFAVerifySetupView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MFACodeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "message": "A 6-digit authenticator code is required."}, status=status.HTTP_400_BAD_REQUEST)

        ok, msg, backup_codes = MFAService.verify_and_enable(request.user, serializer.validated_data["code"])
        if not ok:
            return Response({"success": False, "message": msg}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "success": True,
            "message": msg,
            "backup_codes": backup_codes,
        })


class MFADisableView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MFADisableSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "message": "Valid authenticator code is required."}, status=status.HTTP_400_BAD_REQUEST)

        ok, msg = MFAService.disable_mfa(
            request.user,
            password=serializer.validated_data.get("password", ""),
            code=serializer.validated_data["code"],
        )
        if not ok:
            return Response({"success": False, "message": msg}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"success": True, "message": msg})


class MFARegenerateBackupCodesView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = MFACodeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "message": "Authenticator code required."}, status=status.HTTP_400_BAD_REQUEST)

        ok, msg, codes = MFAService.regenerate_backup_codes(request.user, serializer.validated_data["code"])
        if not ok:
            return Response({"success": False, "message": msg}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"success": True, "message": msg, "backup_codes": codes})


class MFALoginVerifyView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [MFAVerifyThrottle]

    def post(self, request):
        serializer = MFALoginVerifySerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "message": "MFA token and verification code are required."}, status=status.HTTP_400_BAD_REQUEST)

        raw_token = serializer.validated_data["mfa_token"]
        code = serializer.validated_data["code"]
        replace_sid = serializer.validated_data.get("replace_session_id", "").strip() or None

        # Decode once to validate signature without consuming before checking code
        import jwt as _jwt
        try:
            peek = _jwt.decode(raw_token, settings.SECRET_KEY, algorithms=["HS256"])
        except Exception:
            return Response({"success": False, "message": "Verification session expired. Please sign in again."}, status=status.HTTP_401_UNAUTHORIZED)

        if peek.get("purpose") != "mfa_login_challenge":
            return Response({"success": False, "message": "Invalid MFA challenge token."}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.select_related("profile", "mfa").filter(id=peek.get("user_id"), is_active=True).first()
        if not user:
            return Response({"success": False, "message": "Account not found or inactive."}, status=status.HTTP_401_UNAUTHORIZED)

        ok, reason = MFAService.verify_user_code(user, code)
        if not ok:
            return Response({"success": False, "message": reason}, status=status.HTTP_401_UNAUTHORIZED)

        # Consume challenge jti now that verification succeeded
        consumed = MFAService.verify_and_consume_login_challenge(raw_token)
        if not consumed:
            return Response({"success": False, "message": "MFA challenge has already been used."}, status=status.HTTP_401_UNAUTHORIZED)

        sess_ok, sess_msg, sess_data = SessionService.create_enforced_session_and_tokens(
            user=user,
            device_id=consumed.get("device_id", "web-client"),
            platform=consumed.get("platform", "web"),
            app_version=consumed.get("app_version", "1.0.0"),
            device_name=consumed.get("device_name", ""),
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            auth_method=f"{consumed.get('auth_method', 'password')}+mfa",
            replace_session_id=replace_sid,
            audit_action="LOGIN_MFA_SUCCESS",
            audit_details={"mfa_method": reason},
        )
        if not sess_ok:
            return _session_conflict_response(sess_msg, sess_data)

        response = Response({
            "success": True,
            "message": f"Welcome back, {user.name or user.username}!",
            "user": UserSerializer(user).data,
            "session_id": sess_data["session_id"],
        })
        set_jwt_cookie(response, sess_data["access"], sess_data["refresh"])
        return response


# ─── QR Code Companion Device Login ─────────────────────────────────────────
class QRCreateView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [QRCreateThrottle]

    def post(self, request):
        serializer = QRCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        qr_data = QRAuthService.create_session(
            device_id=serializer.validated_data.get("device_id", ""),
            device_name=serializer.validated_data.get("device_name", "Web Browser"),
            platform=serializer.validated_data.get("platform", "web"),
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
        )
        return Response({"success": True, **qr_data})


class QRStatusView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qr_token = (request.query_params.get("token") or "").strip()
        claim_secret = (request.query_params.get("claim_secret") or "").strip()
        if not qr_token or not claim_secret:
            return Response({"success": False, "message": "token and claim_secret are required."}, status=status.HTTP_400_BAD_REQUEST)

        ok, data = QRAuthService.get_status(qr_token=qr_token, claim_secret=claim_secret)
        return Response({"success": ok, **data}, status=status.HTTP_200_OK if ok else status.HTTP_400_BAD_REQUEST)


class QRApproveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = QRApproveSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "message": "QR token is required."}, status=status.HTTP_400_BAD_REQUEST)

        sid = getattr(request, "current_session_id", None)
        approver_session = UserSession.objects.filter(user=request.user, id=sid).first() if sid else None
        replace_sid = serializer.validated_data.get("replace_session_id", "").strip() or None

        ok, msg, data = QRAuthService.approve_session(
            qr_token=serializer.validated_data["qr_token"],
            approver_user=request.user,
            approver_session=approver_session,
            replace_session_id=replace_sid,
        )
        if not ok:
            if data.get("code") == "DEVICE_LIMIT_REACHED":
                return _session_conflict_response(msg, data)
            return Response({"success": False, "message": msg}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"success": True, "message": msg, **data})


class QRClaimView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = QRClaimSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "message": "QR token and claim secret are required."}, status=status.HTTP_400_BAD_REQUEST)

        replace_sid = serializer.validated_data.get("replace_session_id", "").strip() or None
        ok, msg, data = QRAuthService.claim_session(
            qr_token=serializer.validated_data["qr_token"].strip(),
            claim_secret=serializer.validated_data["claim_secret"].strip(),
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            replace_session_id=replace_sid,
        )
        if not ok:
            if data.get("code") == "DEVICE_LIMIT_REACHED":
                return _session_conflict_response(msg, data)
            return Response({"success": False, "message": msg}, status=status.HTTP_400_BAD_REQUEST)

        response = Response({
            "success": True,
            "message": msg,
            "user": UserSerializer(data["user"]).data,
            "session_id": data["session_id"],
        })
        set_jwt_cookie(response, data["access"], data["refresh"])
        return response
