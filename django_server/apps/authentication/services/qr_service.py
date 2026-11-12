"""
WhatsApp-Web style QR companion device authentication service.

Security design:
1. Only the unauthenticated browser/client calling POST /qr/create receives `claim_secret`.
2. Scanning the QR exposes only `qr_token` (embedded in `chitchat://qr-login?token=...`).
3. Only an already-authenticated primary device calling POST /qr/approve authorizes it.
4. Claiming JWTs in POST /qr/claim requires BOTH `qr_token` and `claim_secret`, runs inside
   `select_for_update()` for strict single-use guarantees, and enforces `MAX_ACTIVE_SESSIONS_PER_USER`.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.authentication.models import AuditLog, QRLoginSession, User, UserSession
from apps.authentication.services.session_service import SessionService


def _hash_claim_secret(secret: str) -> str:
    return hashlib.sha256((secret or "").encode("utf-8")).hexdigest()


class QRAuthService:
    QR_TTL_SECONDS = 120

    @classmethod
    def create_session(
        cls,
        *,
        device_id: str = "",
        device_name: str = "Web Browser",
        platform: str = "web",
        ip_address: str | None = None,
        user_agent: str = "",
    ) -> dict:
        now = timezone.now()
        qr_token = secrets.token_urlsafe(32)
        claim_secret = secrets.token_urlsafe(24)
        clean_dev = (device_id or f"web-qr-{secrets.token_hex(6)}")[:128]

        QRLoginSession.objects.create(
            qr_token=qr_token,
            claim_secret_hash=_hash_claim_secret(claim_secret),
            status="pending",
            target_device_id=clean_dev,
            target_device_name=(device_name or "Web Browser")[:120],
            target_platform=platform if platform in ("web", "android", "ios") else "web",
            target_ip=ip_address,
            target_user_agent=(user_agent or "")[:255],
            expires_at=now + timedelta(seconds=cls.QR_TTL_SECONDS),
        )

        return {
            "qr_token": qr_token,
            "claim_secret": claim_secret,
            "qr_payload": f"chitchat://qr-login?token={qr_token}",
            "expires_in": cls.QR_TTL_SECONDS,
        }

    @classmethod
    def get_status(cls, *, qr_token: str, claim_secret: str) -> tuple[bool, dict]:
        qr_obj = QRLoginSession.objects.filter(qr_token=qr_token).first()
        if not qr_obj:
            return False, {"status": "expired", "message": "QR session not found."}
        if not secrets.compare_digest(qr_obj.claim_secret_hash, _hash_claim_secret(claim_secret)):
            return False, {"status": "invalid", "message": "Invalid QR claim secret."}

        if qr_obj.status == "pending" and timezone.now() >= qr_obj.expires_at:
            qr_obj.status = "expired"
            qr_obj.save(update_fields=["status"])

        return True, {
            "status": qr_obj.status,
            "expires_at": qr_obj.expires_at.isoformat(),
        }

    @classmethod
    def approve_session(
        cls,
        *,
        qr_token: str,
        approver_user: User,
        approver_session: UserSession | None = None,
        replace_session_id: str | None = None,
    ) -> tuple[bool, str, dict]:
        raw = (qr_token or "").strip()
        if "token=" in raw:
            raw = raw.split("token=", 1)[1].split("&", 1)[0].strip()

        if not raw:
            return False, "QR token is required.", {}

        now = timezone.now()
        with transaction.atomic():
            qr_obj = QRLoginSession.objects.select_for_update().filter(qr_token=raw).first()
            if not qr_obj:
                return False, "Invalid or unknown QR code.", {}
            if now >= qr_obj.expires_at:
                qr_obj.status = "expired"
                qr_obj.save(update_fields=["status"])
                return False, "This QR code has expired. Refresh it on the companion screen.", {}
            if qr_obj.status != "pending":
                return False, f"QR code has already been {qr_obj.status}.", {}

            has_cap, active_list, max_devices = SessionService.check_device_capacity(
                approver_user,
                device_id=qr_obj.target_device_id,
                replace_session_id=replace_session_id,
            )
            if not has_cap:
                return False, (
                    f"Device limit reached ({len(active_list)}/{max_devices}). "
                    "Revoke an old session or pick one to replace before linking this device."
                ), {
                    "code": "DEVICE_LIMIT_REACHED",
                    "max_devices": max_devices,
                    "active_sessions": active_list,
                }

            if replace_session_id:
                SessionService.revoke_session(approver_user, replace_session_id)

            qr_obj.user = approver_user
            qr_obj.approved_by_session = approver_session
            qr_obj.status = "approved"
            qr_obj.approved_at = now
            qr_obj.save(update_fields=["user", "approved_by_session", "status", "approved_at"])

            AuditLog.objects.create(
                user=approver_user,
                action="QR_LOGIN_APPROVED",
                ip_address=qr_obj.target_ip,
                details={
                    "target_device_id": qr_obj.target_device_id,
                    "target_platform": qr_obj.target_platform,
                    "approved_by_session_id": str(approver_session.id) if approver_session else None,
                },
            )

        return True, f"Authorized {qr_obj.target_device_name or 'companion device'} successfully.", {
            "target_device_name": qr_obj.target_device_name,
            "target_platform": qr_obj.target_platform,
        }

    @classmethod
    def claim_session(
        cls,
        *,
        qr_token: str,
        claim_secret: str,
        ip_address: str | None = None,
        user_agent: str = "",
        replace_session_id: str | None = None,
    ) -> tuple[bool, str, dict]:
        now = timezone.now()
        with transaction.atomic():
            qr_obj = QRLoginSession.objects.select_for_update().select_related("user", "approved_by_session").filter(
                qr_token=qr_token
            ).first()
            if not qr_obj:
                return False, "QR login session not found.", {}
            if not secrets.compare_digest(qr_obj.claim_secret_hash, _hash_claim_secret(claim_secret)):
                return False, "Invalid QR claim secret.", {}
            if now >= qr_obj.expires_at and qr_obj.status == "pending":
                qr_obj.status = "expired"
                qr_obj.save(update_fields=["status"])
                return False, "QR session expired.", {}
            if qr_obj.status != "approved" or not qr_obj.user:
                return False, "QR code has not been approved yet.", {}
            if not qr_obj.user.is_active:
                return False, "Account has been deactivated.", {}

            target_user = qr_obj.user
            linked_parent = qr_obj.approved_by_session
            target_device_id = qr_obj.target_device_id
            target_device_name = qr_obj.target_device_name
            target_platform = qr_obj.target_platform

            ok, msg, session_data = SessionService.create_enforced_session_and_tokens(
                user=target_user,
                device_id=target_device_id,
                platform=target_platform,
                device_name=target_device_name,
                ip_address=ip_address or qr_obj.target_ip,
                user_agent=user_agent or qr_obj.target_user_agent,
                auth_method="qr",
                linked_by_session=linked_parent,
                replace_session_id=replace_session_id,
                audit_action="LOGIN_QR_COMPANION",
                audit_details={"linked_by_session": str(linked_parent.id) if linked_parent else None},
            )
            if not ok:
                return False, msg, session_data

            qr_obj.status = "claimed"
            qr_obj.claimed_at = now
            qr_obj.save(update_fields=["status", "claimed_at"])

        return True, "Companion login successful.", {
            "user": target_user,
            **session_data,
        }

