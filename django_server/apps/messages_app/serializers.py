from rest_framework import serializers
from .models import Message, MessageAttachment


class MessageAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = MessageAttachment
        fields = ["id", "file_name", "file_type", "file_size", "mime_type", "thumbnail_path", "duration", "created_at"]


class MessageSenderSerializer(serializers.Serializer):
    _id = serializers.CharField(source="id", read_only=True)
    id = serializers.CharField(read_only=True)
    name = serializers.CharField(read_only=True)
    username = serializers.CharField(read_only=True)
    avatar = serializers.SerializerMethodField()

    def get_avatar(self, obj):
        if isinstance(obj.avatar, dict):
            return obj.avatar.get("url")
        return None


class MessageSerializer(serializers.ModelSerializer):
    _id = serializers.CharField(source="id", read_only=True)
    content = serializers.CharField(source="decrypted_content", read_only=True)
    attachments = serializers.SerializerMethodField()
    sender = MessageSenderSerializer(read_only=True)
    chat = serializers.CharField(source="conversation_id", read_only=True)
    conversation_id = serializers.CharField(read_only=True)
    client_message_id = serializers.CharField(read_only=True)
    message_type = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    isEdited = serializers.BooleanField(source="is_edited", read_only=True)
    isDeleted = serializers.BooleanField(source="is_deleted", read_only=True)
    replyTo = serializers.JSONField(source="reply_to", read_only=True)
    readBy = serializers.ListField(source="read_by", read_only=True)
    topicName = serializers.CharField(source="topic_name", read_only=True)
    threadRootId = serializers.SerializerMethodField()
    replyCount = serializers.SerializerMethodField()
    viewOnce = serializers.BooleanField(source="view_once", read_only=True)
    viewedBy = serializers.ListField(source="viewed_by", read_only=True)
    scheduledFor = serializers.DateTimeField(source="scheduled_for", read_only=True)
    deliveryPending = serializers.BooleanField(source="delivery_pending", read_only=True)
    expiresAt = serializers.DateTimeField(source="expires_at", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    created_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Message
        fields = [
            "_id",
            "id",
            "content",
            "attachments",
            "sender",
            "chat",
            "conversation_id",
            "client_message_id",
            "message_type",
            "status",
            "isEdited",
            "isDeleted",
            "reactions",
            "replyTo",
            "readBy",
            "topicName",
            "threadRootId",
            "replyCount",
            "viewOnce",
            "viewedBy",
            "scheduledFor",
            "deliveryPending",
            "expiresAt",
            "createdAt",
            "created_at",
        ]

    def get_threadRootId(self, obj):
        return str(obj.thread_root_id) if obj.thread_root_id else None

    def get_replyCount(self, obj):
        reply_map = self.context.get("reply_counts") if isinstance(self.context, dict) else None
        if isinstance(reply_map, dict):
            return int(reply_map.get(str(obj.id), 0))
        return getattr(obj, "reply_count", 0) or 0

    def get_attachments(self, obj):
        raw = list(obj.attachments or [])
        if not obj.view_once:
            return raw
        req = self.context.get("request") if isinstance(self.context, dict) else None
        viewer = getattr(req, "user", None)
        viewer_id = str(viewer.id) if viewer and getattr(viewer, "is_authenticated", False) else ""
        if viewer_id and viewer_id != str(obj.sender_id) and viewer_id in [str(x) for x in (obj.viewed_by or [])]:
            return [
                {
                    **att,
                    "url": "",
                    "path": "",
                    "expiredForViewer": True,
                }
                if isinstance(att, dict)
                else att
                for att in raw
            ]
        return raw
