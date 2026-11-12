import logging
import secrets
import hashlib
from datetime import timedelta
from django.utils import timezone
from django.db import transaction
from django.core.cache import cache
from django.conf import settings
from apps.authentication.models import EmailOTP, User, UserProfile, Device, UserSession, RefreshToken, AuditLog
from apps.authentication.services.email_service import EmailNotificationService
from rest_framework_simplejwt.tokens import RefreshToken as SimpleRefreshToken

logger = logging.getLogger(__name__)


class OTPService:
    @staticmethod
    def _check_ip_rate_limit(ip_address: str, max_requests: int = 5, window_seconds: int = 600) -> bool:
        """Returns True if within rate limit, False if rate limited."""
        if not ip_address:
            return True
        cache_key = f"otp_ratelimit_ip:{ip_address}"
        count = cache.get(cache_key, 0)
        if count >= max_requests:
            return False
        cache.set(cache_key, count + 1, timeout=window_seconds)
        return True

    @classmethod
    def request_otp(cls, email: str, purpose: str = "login", ip_address: str = None) -> tuple[bool, str]:
        email = email.lower().strip()
        now = timezone.now()

        # 1. IP-based Rate Limiting (Prevent OTP Flooding / Denial of Service)
        if ip_address and not cls._check_ip_rate_limit(ip_address, max_requests=6, window_seconds=600):
            return False, "Too many verification requests from your network. Please wait a few minutes before trying again."

        # 2. Per-Email 60-Second Cooldown Check
        recent_otp = EmailOTP.objects.filter(
            email=email,
            is_used=False,
            created_at__gte=now - timedelta(seconds=60)
        ).first()

        if recent_otp:
            remaining = int(60 - (now - recent_otp.created_at).total_seconds())
            return False, f"Please wait {max(1, remaining)} seconds before requesting a new code."

        # 3. Invalidate previous unused OTPs for this email to prevent replays
        EmailOTP.objects.filter(email=email, is_used=False).update(is_used=True)

        # 4. Generate 6-digit cryptographic OTP
        otp = f"{secrets.randbelow(900000) + 100000}"
        hashed = EmailOTP.hash_otp(email, otp)
        expires_at = now + timedelta(minutes=5)

        EmailOTP.objects.create(
            email=email,
            hashed_otp=hashed,
            purpose=purpose,
            attempts=0,
            max_attempts=5,
            is_used=False,
            ip_address=ip_address,
            expires_at=expires_at
        )

        # 5. Send Professional Branded Email via SMTP TLS
        sent = EmailNotificationService.send_otp(email=email, otp=otp, expiry_minutes=5)
        if not sent and not settings.DEBUG:
            return False, "Failed to deliver verification email. Please check server mail configuration."

        if settings.DEBUG:
            logger.info("[DEV] OTP generated for %s is %s", email, otp)

        return True, "Verification code sent to your email."

    @classmethod
    def verify_otp(
        cls,
        email: str,
        otp: str,
        device_id: str = "web-client",
        platform: str = "web",
        app_version: str = "1.0.0",
        ip_address: str = None,
        user_agent: str = "",
        device_name: str = "",
        replace_session_id: str | None = None,
        skip_mfa: bool = False,
    ) -> tuple[bool, str, dict]:
        from apps.authentication.services.mfa_service import MFAService
        from apps.authentication.services.session_service import SessionService

        email = email.lower().strip()
        otp = otp.strip()
        now = timezone.now()

        # Atomic transaction with row lock to eliminate race conditions (TOCTOU)
        with transaction.atomic():
            otp_record = EmailOTP.objects.select_for_update().filter(
                email=email
            ).order_by("-created_at").first()

            if not otp_record:
                return False, "No active verification code found. Please request a new one.", {}

            if otp_record.is_used:
                if otp_record.attempts >= otp_record.max_attempts:
                    return False, "Too many failed attempts. This code has been invalidated.", {}
                return False, "This verification code has already been used or invalidated.", {}

            if otp_record.attempts >= otp_record.max_attempts:
                otp_record.is_used = True
                otp_record.save(update_fields=["is_used"])
                return False, "Too many failed attempts. This code has been invalidated.", {}

            if now > otp_record.expires_at:
                otp_record.is_used = True
                otp_record.save(update_fields=["is_used"])
                return False, "Verification code has expired. Please request a new code.", {}

            if not otp_record.is_valid(otp):
                otp_record.attempts += 1
                otp_record.save(update_fields=["attempts"])
                remaining = otp_record.max_attempts - otp_record.attempts
                if remaining <= 0:
                    otp_record.is_used = True
                    otp_record.save(update_fields=["is_used"])
                    return False, "Too many failed attempts. This code has been invalidated.", {}
                return False, f"Invalid verification code. {remaining} attempt(s) remaining.", {}

            # Mark OTP as consumed (Single-use enforcement)
            otp_record.is_used = True
            otp_record.save(update_fields=["is_used"])

            # Find or register User
            user = User.objects.filter(email=email).first()
            is_new_user = False
            if not user:
                username = email.split("@")[0].lower()
                base_username = username
                counter = 1
                while User.objects.filter(username=username).exists():
                    username = f"{base_username}_{counter}"
                    counter += 1

                user = User.objects.create_user(
                    email=email,
                    username=username,
                    name=base_username.capitalize(),
                    role="user"
                )
                is_new_user = True

            # Ensure profile exists
            UserProfile.objects.get_or_create(user=user, defaults={"display_name": user.name or user.username})

            # Enforce MFA if enabled for this account
            if not skip_mfa and MFAService.is_mfa_enabled(user):
                mfa_token = MFAService.issue_login_challenge(
                    user=user,
                    auth_method="otp",
                    device_id=device_id,
                    platform=platform,
                    app_version=app_version,
                    device_name=device_name,
                )
                return True, "Two-factor verification required.", {
                    "mfa_required": True,
                    "mfa_token": mfa_token,
                    "methods": ["totp", "backup_code"],
                }

            prior_device = Device.objects.filter(user=user, device_id=device_id).exists()

            ok, sess_msg, sess_data = SessionService.create_enforced_session_and_tokens(
                user=user,
                device_id=device_id,
                platform=platform,
                app_version=app_version,
                device_name=device_name,
                ip_address=ip_address,
                user_agent=user_agent,
                auth_method="otp",
                replace_session_id=replace_session_id,
                audit_action="auth.login.otp",
                audit_details={"is_new_user": is_new_user},
            )
            if not ok:
                return False, sess_msg, sess_data

            session = sess_data["session"]
            access_token = sess_data["access"]
            refresh_str = sess_data["refresh"]

        # Dispatch notifications
        if is_new_user:
            EmailNotificationService.send_welcome(email=email, user_name=user.name or user.username)
        elif not prior_device:
            EmailNotificationService.send_new_device_login(
                email=email,
                user_name=user.name or user.username,
                platform=platform,
                ip_address=ip_address or "Unknown",
                user_agent=user_agent,
            )

        return True, "Authentication successful.", {
            "user": {
                "id": str(user.id),
                "_id": str(user.id),
                "email": user.email,
                "username": user.username,
                "name": user.name,
                "avatar": user.avatar,
                "role": user.role,
                "is_staff": user.is_staff,
                "is_superuser": user.is_superuser,
                "mfa_enabled": MFAService.is_mfa_enabled(user),
                "is_new_user": is_new_user,
            },
            "tokens": {
                "access": access_token,
                "refresh": refresh_str,
            },
            "session_id": str(session.id),
        }

    @classmethod
    def recover_account(cls, email: str, otp: str, device_id: str = "web-client", platform: str = "web", ip_address: str = None, user_agent: str = "") -> tuple[bool, str, dict]:
        """
        Secure passwordless account recovery:
        1. Verifies the OTP.
        2. Revokes all prior active sessions and refresh tokens on other devices.
        3. Creates a fresh session for the recovered user.
        4. Sends security alert email.
        """
        email = email.lower().strip()
        user = User.objects.filter(email=email).first()
        if not user:
            return False, "No account found matching this email address.", {}

        # Verify OTP (account recovery proves mailbox ownership & revokes all old sessions)
        success, msg, data = cls.verify_otp(
            email=email,
            otp=otp,
            device_id=device_id,
            platform=platform,
            ip_address=ip_address,
            user_agent=user_agent,
            skip_mfa=True,
        )
        if not success:
            return False, msg, data

        # Revoke all other sessions and tokens for this user (and cache-block active JWT sids)
        from apps.authentication.services.session_service import SessionService

        new_session_id = data.get("session_id")
        SessionService.revoke_all_other_sessions(user, keep_session_id=new_session_id)

        # Send recovery confirmation email
        EmailNotificationService.send_account_recovery(email=email, user_name=user.name or user.username)

        # Record audit log
        AuditLog.objects.create(
            user=user,
            action="auth.account_recovery",
            ip_address=ip_address,
            user_agent=user_agent,
            details={"revoked_other_sessions": True}
        )

        return True, "Account successfully recovered. All other sessions have been revoked.", data

    @classmethod
    def verify_otp_only(cls, email: str, otp: str, purpose: str = "register") -> tuple[bool, str]:
        """
        Validates OTP code for registration or email verification without creating sessions.
        Enforces atomic single-use consumption and attempt limits.
        """
        email = email.lower().strip()
        otp = otp.strip()
        now = timezone.now()

        with transaction.atomic():
            otp_record = EmailOTP.objects.select_for_update().filter(
                email=email,
                purpose=purpose,
            ).order_by("-created_at").first()

            if not otp_record:
                return False, "No active verification code found for this email. Please request a new code."

            if otp_record.is_used:
                return False, "This verification code has already been used. Please request a new code."

            if now > otp_record.expires_at:
                otp_record.is_used = True
                otp_record.save(update_fields=["is_used"])
                return False, "Verification code has expired. Please request a new code."

            if otp_record.attempts >= otp_record.max_attempts:
                otp_record.is_used = True
                otp_record.save(update_fields=["is_used"])
                return False, "Too many failed attempts. This code has been invalidated."

            if not otp_record.is_valid(otp):
                otp_record.attempts += 1
                otp_record.save(update_fields=["attempts"])
                remaining = otp_record.max_attempts - otp_record.attempts
                if remaining <= 0:
                    otp_record.is_used = True
                    otp_record.save(update_fields=["is_used"])
                    return False, "Too many failed attempts. This code has been invalidated."
                return False, f"Invalid verification code. {remaining} attempt(s) remaining."

            # Mark code as consumed
            otp_record.is_used = True
            otp_record.save(update_fields=["is_used"])
            return True, "Verification code confirmed."
