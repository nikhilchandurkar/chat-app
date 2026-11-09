from rest_framework import serializers
from .models import Message, MessageAttachment, MessageReaction


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
    sender = MessageSenderSerializer(read_only=True)
    chat = serializers.CharField(source="conversation.id", read_only=True)
    conversation_id = serializers.CharField(source="conversation.id", read_only=True)
    client_message_id = serializers.CharField(read_only=True)
    message_type = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    isEdited = serializers.BooleanField(source="is_edited", read_only=True)
    isDeleted = serializers.BooleanField(source="is_deleted", read_only=True)
    replyTo = serializers.JSONField(source="reply_to", read_only=True)
    readBy = serializers.ListField(source="read_by", read_only=True)
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
            "createdAt",
            "created_at",
        ]
