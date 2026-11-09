import hashlib
import logging
from datetime import timedelta
from django.utils import timezone
from apps.authentication.models import Device, UserSession, RefreshToken
from rest_framework_simplejwt.tokens import RefreshToken as SimpleRefreshToken

logger = logging.getLogger(__name__)


class SessionService:
    @staticmethod
    def create_session(user, device=None, ip_address: str = None, user_agent: str = "") -> UserSession:
        import secrets
        now = timezone.now()
        session_token = secrets.token_hex(32)
        session = UserSession.objects.create(
            user=user,
            device=device,
            session_token=session_token,
            ip_address=ip_address,
            user_agent=user_agent,
            expires_at=now + timedelta(days=30),
            is_revoked=False,
        )
        return session

    @staticmethod
    def register_device(user, device_id: str, platform: str, app_version: str = "1.0.0", native_fcm_token: str = "") -> Device:
        device, _ = Device.objects.update_or_create(
            user=user,
            device_id=device_id,
            defaults={
                "platform": platform,
                "app_version": app_version,
                "native_fcm_token": native_fcm_token or "",
                "is_active": True,
                "last_active_at": timezone.now(),
            }
        )
        return device

    @staticmethod
    def get_user_sessions(user) -> list[dict]:
        sessions = UserSession.objects.filter(user=user, is_revoked=False).select_related("device").order_by("-created_at")
        results = []
        for s in sessions:
            results.append({
                "id": str(s.id),
                "device_id": s.device.device_id if s.device else "Unknown",
                "platform": s.device.platform if s.device else "Unknown",
                "app_version": s.device.app_version if s.device else "1.0.0",
                "ip_address": s.ip_address,
                "user_agent": s.user_agent,
                "last_active": s.device.last_active_at if s.device else s.created_at,
                "created_at": s.created_at,
            })
        return results

    @staticmethod
    def revoke_session(user, session_id: str) -> bool:
        session = UserSession.objects.filter(user=user, id=session_id).first()
        if not session:
            return False

        session.is_revoked = True
        session.save(update_fields=["is_revoked"])

        # Revoke associated refresh tokens
        RefreshToken.objects.filter(session=session).update(is_revoked=True)
        if session.device:
            session.device.is_active = False
            session.device.save(update_fields=["is_active"])
        return True

    @staticmethod
    def rotate_refresh_token(refresh_token_str: str) -> tuple[bool, str, dict]:
        try:
            token = SimpleRefreshToken(refresh_token_str)
            jti = str(token.get("jti", ""))
            user_id = token.get("user_id")

            # Check if this token was already revoked
            recorded = RefreshToken.objects.filter(jti=jti).first()
            if recorded and recorded.is_revoked:
                # Potential token replay! Invalidate all tokens for this session
                if recorded.session:
                    recorded.session.is_revoked = True
                    recorded.session.save(update_fields=["is_revoked"])
                    RefreshToken.objects.filter(session=recorded.session).update(is_revoked=True)
                return False, "Token has been revoked or replayed.", {}

            # Mark old token as revoked
            if recorded:
                recorded.is_revoked = True
                recorded.save(update_fields=["is_revoked"])

            # Generate new token pair
            token.blacklist()  # If simplejwt blacklist enabled
        except Exception:
            pass

        try:
            from apps.authentication.models import User
            user = User.objects.get(id=user_id)
            new_refresh = SimpleRefreshToken.for_user(user)
            new_access_str = str(new_refresh.access_token)
            new_refresh_str = str(new_refresh)

            # Record new token
            RefreshToken.objects.create(
                user=user,
                session=recorded.session if recorded else None,
                token_hash=hashlib.sha256(new_refresh_str.encode()).hexdigest(),
                jti=str(new_refresh.get("jti", "")),
                expires_at=timezone.now() + timedelta(days=30),
                is_revoked=False
            )

            return True, "Token rotated successfully.", {
                "access": new_access_str,
                "refresh": new_refresh_str,
            }
        except Exception as e:
            logger.error("Token rotation error: %s", str(e))
            return False, "Invalid or expired refresh token.", {}

