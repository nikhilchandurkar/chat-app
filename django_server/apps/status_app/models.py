import uuid
from datetime import timedelta
from django.db import models
from django.utils import timezone
from apps.authentication.models import User


class UserStatus(models.Model):
    TYPE_CHOICES = [
        ("text", "Text"),
        ("image", "Image"),
        ("video", "Video"),
    ]

    PRIVACY_CHOICES = [
        ("everyone", "Everyone"),
        ("contacts", "Contacts Only"),
        ("selected", "Only Selected Users"),
        ("exclude", "Hide From Selected Users"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="statuses")
    status_type = models.CharField(max_length=10, choices=TYPE_CHOICES, default="text")
    content = models.TextField(blank=True, default="")
    media_path = models.CharField(max_length=500, blank=True, default="")
    media_url = models.CharField(max_length=500, blank=True, default="")
    background_color = models.CharField(max_length=20, default="#4f46e5")
    font_style = models.CharField(max_length=32, default="sans-serif")
    privacy = models.CharField(max_length=20, choices=PRIVACY_CHOICES, default="everyone")
    allowed_users = models.ManyToManyField(User, related_name="allowed_statuses", blank=True)
    excluded_users = models.ManyToManyField(User, related_name="excluded_statuses", blank=True)
    expires_at = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "user_statuses"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["expires_at"]),
        ]

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(hours=24)
        super().save(*args, **kwargs)

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    def __str__(self):
        return f"Status {self.id} by {self.user.username} [{self.status_type}]"


class StatusView(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    status = models.ForeignKey(UserStatus, on_delete=models.CASCADE, related_name="views")
    viewer = models.ForeignKey(User, on_delete=models.CASCADE, related_name="viewed_statuses")
    viewed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "status_views"
        unique_together = ("status", "viewer")
        ordering = ["-viewed_at"]


class StatusReaction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    status = models.ForeignKey(UserStatus, on_delete=models.CASCADE, related_name="reactions")
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    reaction = models.CharField(max_length=32)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "status_reactions"
        unique_together = ("status", "user")

