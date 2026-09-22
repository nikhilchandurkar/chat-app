import uuid
from django.db import models
from apps.authentication.models import User


class Chat(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    group_chat = models.BooleanField(default=False, db_index=True)
    creator = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_chats"
    )
    members = models.ManyToManyField(User, related_name="chats")
    admins = models.ManyToManyField(User, related_name="admin_chats", blank=True)
    avatar = models.JSONField(default=dict, blank=True)
    restricted_messages = models.BooleanField(default=False)
    pinned_messages = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "chats"
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.name} ({'Group' if self.group_chat else 'Direct'})"

