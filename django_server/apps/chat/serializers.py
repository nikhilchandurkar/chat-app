from rest_framework import serializers
from apps.authentication.serializers import UserSerializer
from .models import Chat, GroupJoinRequest


class MemberSimpleSerializer(serializers.Serializer):
    _id = serializers.CharField(source="id", read_only=True)
    name = serializers.CharField(read_only=True)
    username = serializers.CharField(read_only=True)
    avatar = serializers.SerializerMethodField()

    def get_avatar(self, obj):
        if isinstance(obj.avatar, dict):
            return obj.avatar.get("url")
        return None


class ChatDetailsSerializer(serializers.ModelSerializer):
    _id = serializers.CharField(source="id", read_only=True)
    groupChat = serializers.BooleanField(source="group_chat", read_only=True)
    restrictedMessages = serializers.BooleanField(source="restricted_messages", read_only=True)
    isSavedMessages = serializers.SerializerMethodField()
    slowModeSeconds = serializers.IntegerField(source="slow_mode_seconds", read_only=True)
    requireJoinApproval = serializers.BooleanField(source="require_join_approval", read_only=True)
    pendingJoinCount = serializers.SerializerMethodField()
    pinnedMessages = serializers.ListField(source="pinned_messages", read_only=True)
    creator = serializers.CharField(source="creator_id", read_only=True, default=None)
    members = MemberSimpleSerializer(many=True, read_only=True)
    admins = serializers.SerializerMethodField()

    class Meta:
        model = Chat
        fields = [
            "_id",
            "name",
            "groupChat",
            "avatar",
            "creator",
            "members",
            "admins",
            "restrictedMessages",
            "isSavedMessages",
            "slowModeSeconds",
            "requireJoinApproval",
            "pendingJoinCount",
            "pinnedMessages",
            "topics",
            "ephemeral_ttl",
            "created_at",
            "updated_at",
        ]

    def get_admins(self, obj):
        return [str(admin.id) for admin in obj.admins.all()]

    def get_pendingJoinCount(self, obj):
        if not obj.group_chat:
            return 0
        return GroupJoinRequest.objects.filter(conversation=obj, status="pending").count()

    def get_isSavedMessages(self, obj):
        return (not obj.group_chat) and obj.name == "Saved Messages" and obj.member_records.count() == 1

