import uuid
import hashlib
import secrets
from datetime import timedelta
from django.utils import timezone
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin


class CustomUserManager(BaseUserManager):
    def create_user(self, email, username=None, password=None, **extra_fields):
        if not email:
            raise ValueError("The Email field is required")
        email = self.normalize_email(email).lower().strip()
        if not username:
            username = email.split("@")[0] + "_" + secrets.token_hex(3)
        user = self.model(email=email, username=username.lower().strip(), **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        UserProfile.objects.get_or_create(user=user, defaults={"display_name": user.name or user.username})
        return user

    def create_superuser(self, email, username=None, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", "admin")
        return self.create_user(email=email, username=username, password=password, **extra_fields)


def default_privacy():
    return {"profile": "everyone"}


class User(AbstractBaseUser, PermissionsMixin):
    ROLE_CHOICES = [
        ("user", "User"),
        ("admin", "Admin"),
    ]

    STATUS_CHOICES = [
        ("online", "Online"),
        ("away", "Away"),
        ("busy", "Busy"),
        ("dnd", "Do Not Disturb"),
        ("offline", "Offline"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, db_index=True)
    username = models.CharField(max_length=50, unique=True, db_index=True)
    name = models.CharField(max_length=100, blank=True, default="", db_index=True)
    bio = models.CharField(max_length=255, blank=True, default="")
    avatar = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default="offline")
    privacy = models.JSONField(default=default_privacy, blank=True)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default="user", db_index=True)
    starred_messages = models.JSONField(default=list, blank=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = CustomUserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    class Meta:
        db_table = "users"
        indexes = [
            models.Index(fields=["created_at", "username"]),
            models.Index(fields=["email"]),
            models.Index(fields=["name"]),
        ]

    def __str__(self):
        return f"{self.email} ({self.username}) [{self.role}]"


class UserProfile(models.Model):
    PRIVACY_CHOICES = [
        ("everyone", "Everyone"),
        ("contacts", "Contacts Only"),
        ("nobody", "Nobody"),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    display_name = models.CharField(max_length=100, blank=True, default="")
    avatar_url = models.CharField(max_length=500, blank=True, default="")
    about = models.TextField(blank=True, default="", max_length=500)
    online_status = models.CharField(max_length=20, default="offline")
    last_seen = models.DateTimeField(auto_now=True)
    privacy_avatar = models.CharField(max_length=20, choices=PRIVACY_CHOICES, default="everyone")
    privacy_online = models.CharField(max_length=20, choices=PRIVACY_CHOICES, default="everyone")
    privacy_last_seen = models.CharField(max_length=20, choices=PRIVACY_CHOICES, default="everyone")
    hide_from_search = models.BooleanField(default=False, db_index=True)
    privacy_read_receipts = models.BooleanField(default=True)
    privacy_typing_indicator = models.BooleanField(default=True)
    who_can_add_to_groups = models.CharField(max_length=20, choices=PRIVACY_CHOICES, default="everyone")
    who_can_message_me = models.CharField(max_length=20, choices=PRIVACY_CHOICES, default="everyone")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "user_profiles"

    def __str__(self):
        return f"Profile of {self.user.email}"


class EmailOTP(models.Model):
    PURPOSE_CHOICES = [
        ("login", "Login"),
        ("register", "Register"),
        ("recovery", "Recovery"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(db_index=True)
    hashed_otp = models.CharField(max_length=128)
    purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES, default="login")
    attempts = models.IntegerField(default=0)
    max_attempts = models.IntegerField(default=5)
    is_used = models.BooleanField(default=False)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "email_otps"
        indexes = [
            models.Index(fields=["email", "created_at"]),
            models.Index(fields=["email", "is_used", "expires_at"]),
        ]

    @staticmethod
    def hash_otp(email: str, otp: str) -> str:
        salt = email.lower().strip()
        return hashlib.sha256(f"{salt}:{otp}:chatapp_secure_salt".encode()).hexdigest()

    def is_valid(self, otp: str) -> bool:
        if self.is_used:
            return False
        if timezone.now() > self.expires_at:
            return False
        if self.attempts >= self.max_attempts:
            return False
        return secrets.compare_digest(self.hashed_otp, self.hash_otp(self.email, otp))


class SocialAccount(models.Model):
    PROVIDER_CHOICES = [
        ("google", "Google"),
        ("github", "GitHub"),
        ("facebook", "Facebook"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="social_accounts")
    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES)
    uid = models.CharField(max_length=255)
    email = models.EmailField(blank=True, default="")
    extra_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "social_accounts"
        unique_together = ("provider", "uid")
        indexes = [
            models.Index(fields=["provider", "uid"]),
            models.Index(fields=["user", "provider"]),
        ]

    def __str__(self):
        return f"{self.user.email} - {self.provider}"


class Device(models.Model):
    PLATFORM_CHOICES = [
        ("android", "Android"),
        ("web", "Web"),
        ("ios", "iOS"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="devices")
    device_id = models.CharField(max_length=128, db_index=True)
    device_name = models.CharField(max_length=120, blank=True, default="")
    platform = models.CharField(max_length=20, choices=PLATFORM_CHOICES, default="web")
    app_version = models.CharField(max_length=32, blank=True, default="1.0.0")
    native_fcm_token = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    last_active_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "devices"
        unique_together = ("user", "device_id")
        indexes = [
            models.Index(fields=["user", "is_active"]),
        ]

    def __str__(self):
        return f"{self.user.email} - {self.platform} ({self.device_id[:8]})"


class UserSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sessions")
    device = models.ForeignKey(Device, on_delete=models.SET_NULL, null=True, blank=True, related_name="sessions")
    session_token = models.CharField(max_length=128, unique=True, db_index=True)
    auth_method = models.CharField(max_length=32, default="password")
    linked_by_session = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="linked_companion_sessions"
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")
    expires_at = models.DateTimeField()
    is_revoked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "user_sessions"
        indexes = [
            models.Index(fields=["user", "is_revoked"]),
        ]

    def __str__(self):
        return f"Session {self.session_token[:8]} for {self.user.email}"


class UserMFA(models.Model):
    """Stores TOTP authenticator secret and one-time recovery backup codes for 2FA."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="mfa")
    is_enabled = models.BooleanField(default=False, db_index=True)
    totp_secret = models.TextField(blank=True, default="")
    pending_secret = models.TextField(blank=True, default="")
    backup_code_hashes = models.JSONField(default=list, blank=True)
    enabled_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "user_mfa"

    def __str__(self):
        return f"MFA({self.user.email}, enabled={self.is_enabled})"


class QRLoginSession(models.Model):
    """Short-lived QR challenge enabling an authenticated phone/device to authorize a companion login."""

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("claimed", "Claimed"),
        ("rejected", "Rejected"),
        ("expired", "Expired"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    qr_token = models.CharField(max_length=96, unique=True, db_index=True)
    claim_secret_hash = models.CharField(max_length=64)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="pending", db_index=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, related_name="qr_sessions")
    approved_by_session = models.ForeignKey(
        UserSession, on_delete=models.SET_NULL, null=True, blank=True, related_name="approved_qr_sessions"
    )
    target_device_id = models.CharField(max_length=128, default="web-qr")
    target_device_name = models.CharField(max_length=120, blank=True, default="Web Browser")
    target_platform = models.CharField(max_length=20, default="web")
    target_ip = models.GenericIPAddressField(null=True, blank=True)
    target_user_agent = models.TextField(blank=True, default="")
    expires_at = models.DateTimeField(db_index=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    claimed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "qr_login_sessions"
        indexes = [
            models.Index(fields=["qr_token", "status"]),
            models.Index(fields=["expires_at", "status"]),
        ]

    def __str__(self):
        return f"QR({self.qr_token[:8]}:{self.status})"


class RefreshToken(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="refresh_tokens")
    session = models.ForeignKey(UserSession, on_delete=models.CASCADE, related_name="refresh_tokens", null=True, blank=True)
    token_hash = models.CharField(max_length=128, db_index=True)
    jti = models.CharField(max_length=128, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    is_revoked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "refresh_tokens"
        indexes = [
            models.Index(fields=["jti", "is_revoked"]),
            models.Index(fields=["user", "expires_at"]),
        ]


class Contact(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="contacts")
    contact_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="added_by_contacts")
    alias = models.CharField(max_length=100, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "contacts"
        unique_together = ("user", "contact_user")
        indexes = [
            models.Index(fields=["user", "created_at"]),
        ]


class BlockedUser(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="blocked_users")
    blocked_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="blocked_by_users")
    reason = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "blocked_users"
        unique_together = ("user", "blocked_user")


class Report(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("reviewed", "Reviewed"),
        ("resolved", "Resolved"),
        ("dismissed", "Dismissed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reporter = models.ForeignKey(User, on_delete=models.CASCADE, related_name="submitted_reports")
    reported_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="received_reports")
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "reports"
        indexes = [
            models.Index(fields=["status", "created_at"]),
        ]


class AuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_logs")
    action = models.CharField(max_length=100, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "audit_logs"
        indexes = [
            models.Index(fields=["action", "created_at"]),
            models.Index(fields=["user", "created_at"]),
        ]


class Request(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("accepted", "Accepted"),
        ("rejected", "Rejected"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sent_requests")
    receiver = models.ForeignKey(User, on_delete=models.CASCADE, related_name="received_requests")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="pending")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "requests"
        unique_together = ("sender", "receiver")
        indexes = [
            models.Index(fields=["receiver", "status"]),
        ]

    def __str__(self):
        return f"{self.sender.username} -> {self.receiver.username} ({self.status})"
