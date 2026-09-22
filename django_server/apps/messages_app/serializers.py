from rest_framework import serializers
from apps.authentication.serializers import UserSerializer
from .models import Message


class MessageSenderSerializer(serializers.Serializer):
    _id = serializers.CharField(source="id", read_only=True)
    name = serializers.CharField(read_only=True)
    avatar = serializers.SerializerMethodField()

    def get_avatar(self, obj):
        if isinstance(obj.avatar, dict):
            return obj.avatar.get("url")
        return None


class MessageSerializer(serializers.ModelSerializer):
    _id = serializers.CharField(source="id", read_only=True)
    content = serializers.CharField(source="decrypted_content", read_only=True)
    sender = MessageSenderSerializer(read_only=True)
    chat = serializers.CharField(source="chat.id", read_only=True)
    isEdited = serializers.BooleanField(source="is_edited", read_only=True)
    isDeleted = serializers.BooleanField(source="is_deleted", read_only=True)
    replyTo = serializers.JSONField(source="reply_to", read_only=True)
    readBy = serializers.ListField(source="read_by", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = Message
        fields = [
            "_id",
            "content",
            "attachments",
            "sender",
            "chat",
            "isEdited",
            "isDeleted",
            "reactions",
            "replyTo",
            "readBy",
            "createdAt",
        ]

