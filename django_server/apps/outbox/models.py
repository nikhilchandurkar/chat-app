import uuid
from django.db import models


class MessageOutbox(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("published", "Published"),
        ("failed", "Failed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event_id = models.CharField(max_length=128, unique=True, db_index=True)
    event_type = models.CharField(max_length=64, db_index=True)
    stream_name = models.CharField(max_length=64, default="chat:events")
    conversation_id = models.CharField(max_length=128, blank=True, default="", db_index=True)
    payload = models.JSONField(default=dict)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending", db_index=True)
    retry_count = models.IntegerField(default=0)
    error_message = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "message_outbox"
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["stream_name", "status"]),
        ]

    def __str__(self):
        return f"Outbox {self.event_type} [{self.status}] ({self.event_id})"

