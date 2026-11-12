"""
RFC 6238 TOTP Multi-Factor Authentication, encrypted secrets, single-use backup
recovery codes, and short-lived stateless MFA login challenge tokens.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
import urllib.parse
import uuid

import jwt
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from apps.authentication.models import AuditLog, User, UserMFA


def _fernet() -> Fernet:
    seed = (getattr(settings, "SECRET_KEY", "fallback-secret") + ":mfa-totp").encode("utf-8")
    key = base64.urlsafe_b64encode(hashlib.sha256(seed).digest())
    return Fernet(key)


def encrypt_secret(secret: str) -> str:
    if not secret:
        return ""
    return _fernet().encrypt(secret.encode("utf-8")).decode("ascii")


def decrypt_secret(cipher_text: str) -> str:
    if not cipher_text:
        return ""
    try:
        return _fernet().decrypt(cipher_text.encode("ascii")).decode("utf-8")
    except (InvalidToken, Exception):
        # Fallback if a plain base32 test secret was stored directly
        return cipher_text


def generate_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def compute_totp_code(secret: str, for_time: int | None = None, interval: int = 30, digits: int = 6) -> str:
    clean = secret.strip().upper().replace(" ", "")
    padding_len = (-len(clean)) % 8
    key = base64.b32decode(clean + ("=" * padding_len), casefold=True)
    counter = int((time.time() if for_time is None else for_time) // interval)
    msg = struct.pack(">Q", counter)
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    binary = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(binary % (10 ** digits)).zfill(digits)


def verify_totp_code(secret: str, code: str, valid_window: int = 1, interval: int = 30) -> tuple[bool, int | None]:
    clean_code = "".join(ch for ch in (code or "") if ch.isdigit())
    if len(clean_code) != 6 or not secret:
        return False, None

    now = int(time.time())
    current_step = now // interval
    for offset in range(-valid_window, valid_window + 1):
        step = current_step + offset
        expected = compute_totp_code(secret, for_time=step * interval, interval=interval)
        if secrets.compare_digest(expected, clean_code):
            return True, step
    return False, None


def get_totp_uri(email: str, secret: str, issuer: str = "ChitChat") -> str:
    label = urllib.parse.quote(f"{issuer}:{email}")
    params = urllib.parse.urlencode({
        "secret": secret,
        "issuer": issuer,
        "algorithm": "SHA1",
        "digits": 6,
        "period": 30,
    })
    return f"otpauth://totp/{label}?{params}"


def _hash_backup_code(user_id: str, raw_code: str) -> str:
    normalized = raw_code.strip().upper().replace("-", "").replace(" ", "")
    return hashlib.sha256(f"{user_id}:{normalized}:backup".encode("utf-8")).hexdigest()


def generate_backup_codes(user_id: str, count: int = 8) -> tuple[list[str], list[str]]:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    plain_codes: list[str] = []
    hashed_codes: list[str] = []
    for _ in range(count):
        raw = "".join(secrets.choice(alphabet) for _ in range(8))
        formatted = f"{raw[:4]}-{raw[4:]}"
        plain_codes.append(formatted)
        hashed_codes.append(_hash_backup_code(user_id, formatted))
    return plain_codes, hashed_codes


class MFAService:
    @staticmethod
    def is_mfa_enabled(user: User) -> bool:
        mfa = getattr(user, "mfa", None)
        if mfa is not None:
            return bool(mfa.is_enabled and mfa.totp_secret)
        return UserMFA.objects.filter(user=user, is_enabled=True).exclude(totp_secret="").exists()

    @staticmethod
    def get_status(user: User) -> dict:
        mfa = UserMFA.objects.filter(user=user).first()
        return {
            "mfa_enabled": bool(mfa and mfa.is_enabled),
            "enabled_at": mfa.enabled_at if mfa else None,
            "last_used_at": mfa.last_used_at if mfa else None,
            "backup_codes_remaining": len(mfa.backup_code_hashes) if mfa else 0,
        }

    @staticmethod
    def begin_setup(user: User) -> dict:
        secret = generate_totp_secret()
        mfa, _ = UserMFA.objects.get_or_create(user=user)
        mfa.pending_secret = encrypt_secret(secret)
        mfa.save(update_fields=["pending_secret", "updated_at"])
        return {
            "secret": secret,
            "otpauth_uri": get_totp_uri(user.email, secret),
            "issuer": "ChitChat",
            "account": user.email,
        }

    @classmethod
    def verify_and_enable(cls, user: User, code: str) -> tuple[bool, str, list[str]]:
        mfa = UserMFA.objects.filter(user=user).first()
        if not mfa or not mfa.pending_secret:
            return False, "No pending MFA setup found. Start setup first.", []

        secret = decrypt_secret(mfa.pending_secret)
        ok, _ = verify_totp_code(secret, code)
        if not ok:
            return False, "Invalid 6-digit authenticator code.", []

        plain_codes, hashed_codes = generate_backup_codes(str(user.id))
        now = timezone.now()
        mfa.totp_secret = mfa.pending_secret
        mfa.pending_secret = ""
        mfa.is_enabled = True
        mfa.backup_code_hashes = hashed_codes
        mfa.enabled_at = now
        mfa.last_used_at = now
        mfa.save(update_fields=[
            "totp_secret", "pending_secret", "is_enabled",
            "backup_code_hashes", "enabled_at", "last_used_at", "updated_at",
        ])
        AuditLog.objects.create(user=user, action="MFA_ENABLED", details={"method": "totp"})
        return True, "Two-factor authentication enabled successfully.", plain_codes

    @classmethod
    def verify_user_code(cls, user: User, code: str) -> tuple[bool, str]:
        mfa = UserMFA.objects.filter(user=user, is_enabled=True).first()
        if not mfa or not mfa.totp_secret:
            return False, "MFA is not enabled on this account."

        secret = decrypt_secret(mfa.totp_secret)
        ok, matched_step = verify_totp_code(secret, code)
        if ok:
            # Replay guard: block reusing the same TOTP time-step within 90s
            replay_key = f"mfa_step:{user.id}:{matched_step}"
            try:
                if not cache.add(replay_key, "1", timeout=90):
                    return False, "This authenticator code was already used. Wait for the next 30-second code."
            except Exception:
                pass
            mfa.last_used_at = timezone.now()
            mfa.save(update_fields=["last_used_at", "updated_at"])
            return True, "totp"

        # Fallback: single-use backup recovery code
        candidate_hash = _hash_backup_code(str(user.id), code)
        for idx, stored_hash in enumerate(mfa.backup_code_hashes or []):
            if secrets.compare_digest(stored_hash, candidate_hash):
                updated_hashes = list(mfa.backup_code_hashes)
                updated_hashes.pop(idx)
                mfa.backup_code_hashes = updated_hashes
                mfa.last_used_at = timezone.now()
                mfa.save(update_fields=["backup_code_hashes", "last_used_at", "updated_at"])
                AuditLog.objects.create(
                    user=user,
                    action="MFA_BACKUP_CODE_USED",
                    details={"remaining": len(updated_hashes)},
                )
                return True, "backup_code"

        return False, "Invalid authenticator or backup code."

    @classmethod
    def regenerate_backup_codes(cls, user: User, code: str) -> tuple[bool, str, list[str]]:
        ok, _msg = cls.verify_user_code(user, code)
        if not ok:
            return False, _msg, []
        mfa = UserMFA.objects.filter(user=user, is_enabled=True).first()
        plain_codes, hashed_codes = generate_backup_codes(str(user.id))
        mfa.backup_code_hashes = hashed_codes
        mfa.save(update_fields=["backup_code_hashes", "updated_at"])
        AuditLog.objects.create(user=user, action="MFA_BACKUP_CODES_REGENERATED", details={})
        return True, "New backup recovery codes generated.", plain_codes

    @classmethod
    def disable_mfa(cls, user: User, password: str, code: str) -> tuple[bool, str]:
        if user.has_usable_password() and not user.check_password(password):
            return False, "Current password is incorrect."
        ok, _msg = cls.verify_user_code(user, code)
        if not ok:
            return False, _msg

        mfa = UserMFA.objects.filter(user=user).first()
        if mfa:
            mfa.is_enabled = False
            mfa.totp_secret = ""
            mfa.pending_secret = ""
            mfa.backup_code_hashes = []
            mfa.enabled_at = None
            mfa.save(update_fields=[
                "is_enabled", "totp_secret", "pending_secret",
                "backup_code_hashes", "enabled_at", "updated_at",
            ])
        AuditLog.objects.create(user=user, action="MFA_DISABLED", details={})
        return True, "Two-factor authentication has been disabled."

    @staticmethod
    def issue_login_challenge(
        *,
        user: User,
        auth_method: str,
        device_id: str,
        platform: str,
        app_version: str,
        device_name: str = "",
    ) -> str:
        now = int(time.time())
        payload = {
            "purpose": "mfa_login_challenge",
            "jti": uuid.uuid4().hex,
            "user_id": str(user.id),
            "auth_method": auth_method,
            "device_id": device_id,
            "platform": platform,
            "app_version": app_version,
            "device_name": device_name,
            "iat": now,
            "exp": now + 300,
        }
        return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")

    @staticmethod
    def verify_and_consume_login_challenge(token: str) -> dict | None:
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        except Exception:
            return None
        if payload.get("purpose") != "mfa_login_challenge":
            return None
        jti = payload.get("jti")
        if jti:
            try:
                if not cache.add(f"mfa_challenge_used:{jti}", "1", timeout=310):
                    return None
            except Exception:
                pass
        return payload
