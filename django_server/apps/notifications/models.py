import uuid
from django.db import models
from apps.authentication.models import User, Device


class Notification(models.Model):
    TYPE_CHOICES = [
        ("message", "Direct Message"),
        ("group_message", "Group Message"),
        ("mention", "Mention"),
        ("invitation", "Group Invitation"),
        ("system", "System Alert"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    title = models.CharField(max_length=255)
    body = models.TextField()
    data = models.JSONField(default=dict, blank=True)
    notification_type = models.CharField(max_length=30, choices=TYPE_CHOICES, default="message")
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "notifications"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "is_read"]),
        ]

    def __str__(self):
        return f"Notification {self.title} to {self.user.email}"


class NotificationPreference(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="notification_preferences")
    direct_messages = models.BooleanField(default=True)
    group_messages = models.BooleanField(default=True)
    sound_enabled = models.BooleanField(default=True)
    message_preview = models.BooleanField(default=True)
    web_push_enabled = models.BooleanField(default=True)
    fcm_enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "notification_preferences"

    def __str__(self):
        return f"Preferences for {self.user.email}"


class NotificationDelivery(models.Model):
    STATUS_CHOICES = [
        ("queued", "Queued"),
        ("sent", "Sent"),
        ("failed", "Failed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    notification = models.ForeignKey(Notification, on_delete=models.CASCADE, related_name="deliveries")
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="notification_deliveries")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="queued")
    error_message = models.TextField(blank=True, default="")
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notification_delivery"
        indexes = [
            models.Index(fields=["status", "created_at"]),
        ]


class WebPushSubscription(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="web_push_subscriptions")
    device = models.ForeignKey(Device, on_delete=models.SET_NULL, null=True, blank=True)
    endpoint = models.TextField()
    p256dh_key = models.CharField(max_length=255)
    auth_key = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "web_push_subscriptions"
        indexes = [
            models.Index(fields=["user", "created_at"]),
        ]

