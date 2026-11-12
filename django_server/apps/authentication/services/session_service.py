import hashlib
import logging
import secrets
import time
import uuid
from datetime import timedelta

import jwt
from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken as SimpleRefreshToken

from apps.authentication.models import AuditLog, Device, RefreshToken, User, UserSession

logger = logging.getLogger(__name__)

REVOKED_SID_TTL_SECONDS = 3600 * 2  # Covers access token lifetime


def _cache_revoked_sid(session_id) -> None:
    if session_id:
        try:
            cache.set(f"revoked_sid:{session_id}", "1", timeout=REVOKED_SID_TTL_SECONDS)
        except Exception:
            pass


def _summarize_session(session: UserSession, current_session_id: str | None = None) -> dict:
    dev = session.device
    return {
        "id": str(session.id),
        "device_id": dev.device_id if dev else "Unknown",
        "device_name": (dev.device_name or dev.platform.title()) if dev else "Unknown Device",
        "platform": dev.platform if dev else "Unknown",
        "app_version": dev.app_version if dev else "1.0.0",
        "auth_method": getattr(session, "auth_method", "password") or "password",
        "linked_by_session": str(session.linked_by_session_id) if session.linked_by_session_id else None,
        "ip_address": session.ip_address,
        "user_agent": session.user_agent,
        "is_current": bool(current_session_id and str(session.id) == str(current_session_id)),
        "last_active": dev.last_active_at if dev else session.created_at,
        "created_at": session.created_at,
        "expires_at": session.expires_at,
    }


class SessionService:
    @staticmethod
    def get_max_devices() -> int:
        return max(1, int(getattr(settings, "MAX_ACTIVE_SESSIONS_PER_USER", 3)))

    @staticmethod
    def is_session_revoked(session_id: str | None) -> bool:
        if not session_id:
            return False
        cache_key = f"revoked_sid:{session_id}"
        try:
            cached = cache.get(cache_key)
            if cached == "1":
                return True
            if cached == "0":
                return False
        except Exception:
            pass

        is_revoked = not UserSession.objects.filter(
            id=session_id, is_revoked=False, expires_at__gt=timezone.now()
        ).exists()
        try:
            cache.set(cache_key, "1" if is_revoked else "0", timeout=3600 if is_revoked else 300)
        except Exception:
            pass
        return is_revoked

    @staticmethod
    def mark_user_sessions_revoked(user) -> int:
        sessions = list(UserSession.objects.filter(user=user, is_revoked=False).values_list("id", flat=True))
        if not sessions:
            return 0
        UserSession.objects.filter(id__in=sessions).update(is_revoked=True)
        RefreshToken.objects.filter(session_id__in=sessions).update(is_revoked=True)
        Device.objects.filter(user=user).update(is_active=False)
        for sid in sessions:
            _cache_revoked_sid(str(sid))
        return len(sessions)

    @staticmethod
    def create_session(
        user,
        device=None,
        ip_address: str = None,
        user_agent: str = "",
        auth_method: str = "password",
        linked_by_session=None,
    ) -> UserSession:
        now = timezone.now()
        session_token = secrets.token_hex(32)
        return UserSession.objects.create(
            user=user,
            device=device,
            session_token=session_token,
            auth_method=auth_method,
            linked_by_session=linked_by_session,
            ip_address=ip_address,
            user_agent=user_agent,
            expires_at=now + timedelta(days=30),
            is_revoked=False,
        )

    @staticmethod
    def issue_tokens_for_session(user: User, session: UserSession) -> tuple[str, str]:
        """Mints a SimpleJWT access/refresh pair bound to `sid` and stores the refresh JTI."""
        now = timezone.now()
        jwt_refresh = SimpleRefreshToken.for_user(user)
        jwt_refresh["sid"] = str(session.id)
        access_tok = jwt_refresh.access_token
        access_tok["sid"] = str(session.id)

        access_str = str(access_tok)
        refresh_str = str(jwt_refresh)

        RefreshToken.objects.create(
            user=user,
            session=session,
            token_hash=hashlib.sha256(refresh_str.encode()).hexdigest(),
            jti=str(jwt_refresh.get("jti", "")),
            expires_at=now + timedelta(days=30),
            is_revoked=False,
        )
        return access_str, refresh_str

    @classmethod
    def check_device_capacity(
        cls,
        user: User,
        device_id: str | None = None,
        replace_session_id: str | None = None,
    ) -> tuple[bool, list[dict], int]:
        """Checks whether `user` has capacity for another active device session."""
        now = timezone.now()
        max_devices = cls.get_max_devices()
        active = list(
            UserSession.objects.filter(user=user, is_revoked=False, expires_at__gt=now)
            .select_related("device")
            .order_by("created_at")
        )
        # Re-login on the same device_id or replacing an explicit session frees that slot
        effective = [
            s
            for s in active
            if not (
                (device_id and s.device and s.device.device_id == device_id)
                or (replace_session_id and str(s.id) == str(replace_session_id))
            )
        ]
        if len(effective) >= max_devices:
            return False, [_summarize_session(s) for s in active], max_devices
        return True, [_summarize_session(s) for s in active], max_devices

    @classmethod
    def create_enforced_session_and_tokens(
        cls,
        *,
        user: User,
        device_id: str = "web-client",
        platform: str = "web",
        app_version: str = "1.0.0",
        device_name: str = "",
        ip_address: str | None = None,
        user_agent: str = "",
        auth_method: str = "password",
        linked_by_session: UserSession | None = None,
        replace_session_id: str | None = None,
        audit_action: str = "LOGIN_SUCCESS",
        audit_details: dict | None = None,
    ) -> tuple[bool, str, dict]:
        """
        Shared login/session issuance entrypoint enforcing concurrent device limits,
        same-device session reuse, JWT `sid` binding, and audit logging.
        """
        now = timezone.now()
        clean_device_id = (device_id or "web-client").strip()[:128]
        clean_device_name = (device_name or f"{platform.title()} Client").strip()[:120]
        max_devices = cls.get_max_devices()

        with transaction.atomic():
            # Clean up expired sessions first so stale rows never consume device slots
            UserSession.objects.filter(user=user, is_revoked=False, expires_at__lte=now).update(is_revoked=True)

            active_sessions = list(
                UserSession.objects.select_for_update()
                .filter(user=user, is_revoked=False, expires_at__gt=now)
                .select_related("device")
                .order_by("created_at")
            )

            # Reuse slot if the exact same device_id already has an active session
            same_device_sessions = [s for s in active_sessions if s.device and s.device.device_id == clean_device_id]
            for old_s in same_device_sessions:
                old_s.is_revoked = True
                old_s.save(update_fields=["is_revoked"])
                RefreshToken.objects.filter(session=old_s).update(is_revoked=True)
                _cache_revoked_sid(str(old_s.id))

            # Explicit session replacement chosen by user when resolving a full device list
            if replace_session_id:
                target_s = next((s for s in active_sessions if str(s.id) == str(replace_session_id)), None)
                if target_s and not target_s.is_revoked:
                    target_s.is_revoked = True
                    target_s.save(update_fields=["is_revoked"])
                    RefreshToken.objects.filter(session=target_s).update(is_revoked=True)
                    _cache_revoked_sid(str(target_s.id))
                    if target_s.device and target_s.device.device_id != clean_device_id:
                        target_s.device.is_active = False
                        target_s.device.save(update_fields=["is_active"])

            remaining = [
                s
                for s in active_sessions
                if not s.is_revoked
            ]
            if len(remaining) >= max_devices:
                limit_token = cls.issue_device_limit_token(
                    user=user,
                    auth_method=auth_method,
                    device_id=clean_device_id,
                    platform=platform,
                    app_version=app_version,
                    device_name=clean_device_name,
                    linked_by_session_id=str(linked_by_session.id) if linked_by_session else None,
                )
                return False, (
                    f"Maximum active device limit ({max_devices}) reached. "
                    "Revoke an existing device session to sign in on this device."
                ), {
                    "code": "DEVICE_LIMIT_REACHED",
                    "max_devices": max_devices,
                    "active_sessions": [_summarize_session(s) for s in remaining],
                    "device_limit_token": limit_token,
                }

            device, _ = Device.objects.update_or_create(
                user=user,
                device_id=clean_device_id,
                defaults={
                    "device_name": clean_device_name,
                    "platform": platform,
                    "app_version": app_version,
                    "is_active": True,
                    "last_active_at": now,
                },
            )

            user.status = "online"
            user.last_login = now
            user.save(update_fields=["status", "last_login"])

            session = cls.create_session(
                user=user,
                device=device,
                ip_address=ip_address,
                user_agent=user_agent,
                auth_method=auth_method,
                linked_by_session=linked_by_session,
            )
            access_str, refresh_str = cls.issue_tokens_for_session(user, session)

            details = {"method": auth_method, "platform": platform, "device_id": clean_device_id}
            if audit_details:
                details.update(audit_details)

            AuditLog.objects.create(
                user=user,
                action=audit_action,
                ip_address=ip_address,
                user_agent=(user_agent or "")[:255],
                details=details,
            )

        return True, "Authenticated successfully.", {
            "session": session,
            "session_id": str(session.id),
            "device": device,
            "access": access_str,
            "refresh": refresh_str,
        }

    @staticmethod
    def register_device(
        user,
        device_id: str,
        platform: str,
        app_version: str = "1.0.0",
        native_fcm_token: str = "",
        device_name: str = "",
    ) -> Device:
        defaults = {
            "platform": platform,
            "app_version": app_version,
            "native_fcm_token": native_fcm_token or "",
            "is_active": True,
            "last_active_at": timezone.now(),
        }
        if device_name:
            defaults["device_name"] = device_name[:120]
        device, _ = Device.objects.update_or_create(
            user=user,
            device_id=device_id,
            defaults=defaults,
        )
        return device

    @classmethod
    def get_user_sessions(cls, user, current_session_id: str | None = None) -> list[dict]:
        now = timezone.now()
        sessions = (
            UserSession.objects.filter(user=user, is_revoked=False, expires_at__gt=now)
            .select_related("device")
            .order_by("-created_at")
        )
        return [_summarize_session(s, current_session_id=current_session_id) for s in sessions]

    @staticmethod
    def revoke_session(user, session_id: str) -> bool:
        session = UserSession.objects.filter(user=user, id=session_id).first()
        if not session:
            return False

        session.is_revoked = True
        session.save(update_fields=["is_revoked"])

        RefreshToken.objects.filter(session=session).update(is_revoked=True)
        _cache_revoked_sid(str(session.id))
        if session.device:
            session.device.is_active = False
            session.device.save(update_fields=["is_active"])
        return True

    @staticmethod
    def revoke_all_other_sessions(user, keep_session_id: str | None = None) -> int:
        qs = UserSession.objects.filter(user=user, is_revoked=False)
        if keep_session_id:
            qs = qs.exclude(id=keep_session_id)
        target_ids = list(qs.values_list("id", flat=True))
        if not target_ids:
            return 0

        device_ids = list(qs.exclude(device_id__isnull=True).values_list("device_id", flat=True))
        UserSession.objects.filter(id__in=target_ids).update(is_revoked=True)
        RefreshToken.objects.filter(session_id__in=target_ids).update(is_revoked=True)
        if device_ids:
            Device.objects.filter(id__in=device_ids).update(is_active=False)
        for sid in target_ids:
            _cache_revoked_sid(str(sid))
        return len(target_ids)

    @staticmethod
    def rotate_refresh_token(refresh_token_str: str) -> tuple[bool, str, dict]:
        recorded = None
        user_id = None
        try:
            token = SimpleRefreshToken(refresh_token_str)
            jti = str(token.get("jti", ""))
            user_id = token.get("user_id")

            recorded = RefreshToken.objects.select_related("session").filter(jti=jti).first()
            if recorded and recorded.is_revoked:
                if recorded.session:
                    recorded.session.is_revoked = True
                    recorded.session.save(update_fields=["is_revoked"])
                    RefreshToken.objects.filter(session=recorded.session).update(is_revoked=True)
                    _cache_revoked_sid(str(recorded.session.id))
                return False, "Token has been revoked or replayed.", {}

            if recorded and recorded.session and (
                recorded.session.is_revoked or recorded.session.expires_at <= timezone.now()
            ):
                _cache_revoked_sid(str(recorded.session.id))
                return False, "Session has been revoked or expired.", {}

            if recorded:
                recorded.is_revoked = True
                recorded.save(update_fields=["is_revoked"])

            try:
                token.blacklist()
            except Exception:
                pass
        except Exception:
            return False, "Invalid or expired refresh token.", {}

        try:
            user = User.objects.get(id=user_id, is_active=True)
            session = recorded.session if recorded else None
            new_refresh = SimpleRefreshToken.for_user(user)
            if session:
                new_refresh["sid"] = str(session.id)
                new_refresh.access_token["sid"] = str(session.id)
            new_access_str = str(new_refresh.access_token)
            new_refresh_str = str(new_refresh)

            RefreshToken.objects.create(
                user=user,
                session=session,
                token_hash=hashlib.sha256(new_refresh_str.encode()).hexdigest(),
                jti=str(new_refresh.get("jti", "")),
                expires_at=timezone.now() + timedelta(days=30),
                is_revoked=False,
            )

            return True, "Token rotated successfully.", {
                "access": new_access_str,
                "refresh": new_refresh_str,
            }
        except Exception as e:
            logger.error("Token rotation error: %s", str(e))
            return False, "Invalid or expired refresh token.", {}

    @staticmethod
    def issue_device_limit_token(
        *,
        user: User,
        auth_method: str,
        device_id: str,
        platform: str,
        app_version: str = "1.0.0",
        device_name: str = "",
        linked_by_session_id: str | None = None,
    ) -> str:
        now = int(time.time())
        payload = {
            "purpose": "device_limit_resolve",
            "jti": uuid.uuid4().hex,
            "user_id": str(user.id),
            "auth_method": auth_method,
            "device_id": device_id,
            "platform": platform,
            "app_version": app_version,
            "device_name": device_name,
            "linked_by_session_id": linked_by_session_id,
            "iat": now,
            "exp": now + 300,
        }
        return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")

    @staticmethod
    def consume_device_limit_token(token: str) -> dict | None:
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        except Exception:
            return None
        if payload.get("purpose") != "device_limit_resolve":
            return None
        jti = payload.get("jti")
        if jti:
            try:
                if not cache.add(f"dev_limit_used:{jti}", "1", timeout=310):
                    return None
            except Exception:
                pass
        return payload
