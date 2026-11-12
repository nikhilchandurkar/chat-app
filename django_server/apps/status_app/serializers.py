from rest_framework import serializers
from apps.authentication.models import User
from .models import UserStatus, StatusView, StatusReaction


class StatusUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "name", "username", "avatar"]


class StatusViewerSerializer(serializers.ModelSerializer):
    viewer = StatusUserSerializer(read_only=True)

    class Meta:
        model = StatusView
        fields = ["id", "viewer", "viewed_at"]


class UserStatusSerializer(serializers.ModelSerializer):
    user = StatusUserSerializer(read_only=True)
    views_count = serializers.SerializerMethodField()
    has_viewed = serializers.SerializerMethodField()
    reactions = serializers.SerializerMethodField()

    class Meta:
        model = UserStatus
        fields = [
            "id",
            "user",
            "status_type",
            "content",
            "media_url",
            "background_color",
            "font_style",
            "privacy",
            "created_at",
            "expires_at",
            "views_count",
            "has_viewed",
            "reactions",
        ]

    def get_views_count(self, obj):
        return obj.views.count()

    def get_has_viewed(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            return obj.views.filter(viewer=request.user).exists()
        return False

    def get_reactions(self, obj):
        items = obj.reactions.select_related("user").order_by("-created_at")
        return [
            {
                "id": str(r.id),
                "user_id": str(r.user_id),
                "reaction": r.reaction,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "user": {
                    "id": str(r.user_id),
                    "name": r.user.name or r.user.username,
                    "username": r.user.username,
                    "avatar": r.user.avatar,
                },
            }
            for r in items
        ]

