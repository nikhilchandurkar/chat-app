import uuid
from django.db import models
from apps.authentication.models import User


class Conversation(models.Model):
    TYPE_CHOICES = [
        ("direct", "Direct"),
        ("group", "Group"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=150, blank=True, default="")
    type = models.CharField(max_length=10, choices=TYPE_CHOICES, default="direct", db_index=True)
    group_chat = models.BooleanField(default=False, db_index=True)
    creator = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_conversations"
    )
    members = models.ManyToManyField(
        User,
        through="ConversationMember",
        related_name="chats"
    )
    admins = models.ManyToManyField(
        User,
        related_name="admin_chats",
        blank=True
    )
    avatar = models.JSONField(default=dict, blank=True)
    restricted_messages = models.BooleanField(default=False)
    pinned_messages = models.JSONField(default=list, blank=True)
    topics = models.JSONField(default=list, blank=True)
    ephemeral_ttl = models.IntegerField(default=0, help_text="Duration in seconds. 0 = disabled.")
    is_archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "conversations"
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["type", "-updated_at"]),
        ]

    def __str__(self):
        title = self.name or (f"Direct Chat ({self.id})" if self.type == "direct" else "Group")
        return f"{title} [{self.type}]"

    def save(self, *args, **kwargs):
        if self.type == "group":
            self.group_chat = True
        elif self.group_chat:
            self.type = "group"
        super().save(*args, **kwargs)


# Backward compatibility alias
Chat = Conversation


class ConversationMember(models.Model):
    ROLE_CHOICES = [
        ("member", "Member"),
        ("admin", "Admin"),
        ("owner", "Owner"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="member_records"
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="conversation_memberships"
    )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default="member")
    joined_at = models.DateTimeField(auto_now_add=True)
    is_muted = models.BooleanField(default=False)
    mute_until = models.DateTimeField(null=True, blank=True)
    is_archived = models.BooleanField(default=False)
    is_pinned = models.BooleanField(default=False)
    is_deleted_for_user = models.BooleanField(default=False)
    cleared_at = models.DateTimeField(null=True, blank=True)
    last_read_message_id = models.CharField(max_length=64, blank=True, default="")
    unread_count = models.IntegerField(default=0)

    class Meta:
        db_table = "conversation_members"
        unique_together = ("conversation", "user")
        indexes = [
            models.Index(fields=["user", "-joined_at"]),
            models.Index(fields=["conversation", "user"]),
        ]

    def __str__(self):
        return f"{self.user.username} in {self.conversation_id} ({self.role})"


class Group(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.OneToOneField(
        Conversation,
        on_delete=models.CASCADE,
        related_name="group_details"
    )
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True, default="")
    avatar = models.JSONField(default=dict, blank=True)
    avatar_url = models.CharField(max_length=500, blank=True, default="")
    restrict_messages = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "groups"

    def __str__(self):
        return f"Group: {self.name}"


class GroupMember(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="group_memberships")
    role = models.CharField(max_length=10, default="member")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "group_members"
        unique_together = ("group", "user")


class PinnedMessage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="pinned_message_records"
    )
    message = models.ForeignKey(
        "messages_app.Message",
        on_delete=models.CASCADE,
        related_name="pins"
    )
    pinned_by = models.ForeignKey(User, on_delete=models.CASCADE)
    pinned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "pinned_messages"
        unique_together = ("conversation", "message")


class InvitationLink(models.Model):
    INVITATION_TYPE_CHOICES = [
        ("group", "Group"),
        ("direct", "Direct"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    token_hash = models.CharField(max_length=128, unique=True, db_index=True)
    invitation_type = models.CharField(max_length=20, choices=INVITATION_TYPE_CHOICES, default="group")
    conversation = models.ForeignKey(
        Conversation,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="invitation_links"
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="created_invitations"
    )
    max_uses = models.IntegerField(default=1, help_text="0 for unlimited uses")
    uses_count = models.IntegerField(default=0)
    expires_at = models.DateTimeField(db_index=True)
    is_revoked = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "invitation_links"
        indexes = [
            models.Index(fields=["token_hash", "is_revoked"]),
            models.Index(fields=["conversation", "is_revoked"]),
        ]

    def is_valid(self):
        from django.utils import timezone
        if self.is_revoked:
            return False
        if timezone.now() > self.expires_at:
            return False
        if self.max_uses > 0 and self.uses_count >= self.max_uses:
            return False
        return True
