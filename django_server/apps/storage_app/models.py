import uuid
from django.db import models
from apps.authentication.models import User


class UploadSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="upload_sessions")
    file_name = models.CharField(max_length=255)
    file_type = models.CharField(max_length=50, default="document")
    total_size = models.BigIntegerField()
    total_chunks = models.IntegerField(default=1)
    mime_type = models.CharField(max_length=120, blank=True, default="application/octet-stream")
    checksum_sha256 = models.CharField(max_length=64, blank=True, default="")
    temp_dir = models.CharField(max_length=500, blank=True, default="")
    final_path = models.CharField(max_length=500, blank=True, default="")
    is_completed = models.BooleanField(default=False)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "upload_sessions"
        indexes = [
            models.Index(fields=["user", "is_completed"]),
        ]

    def __str__(self):
        return f"Upload {self.file_name} ({self.id})"


class UploadChunk(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(UploadSession, on_delete=models.CASCADE, related_name="chunks")
    chunk_index = models.IntegerField()
    chunk_size = models.BigIntegerField()
    chunk_file_path = models.CharField(max_length=500)
    is_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "upload_chunks"
        unique_together = ("session", "chunk_index")
        ordering = ["chunk_index"]


class UserStorageUsage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="storage_usage")
    bytes_used = models.BigIntegerField(default=0)
    quota_bytes = models.BigIntegerField(default=10 * 1024 * 1024 * 1024)  # Default 10GB
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "user_storage_usage"

    def __str__(self):
        return f"{self.user.email}: {self.bytes_used}/{self.quota_bytes} bytes"

