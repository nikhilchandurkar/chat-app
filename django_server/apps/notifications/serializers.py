from rest_framework import serializers
from .models import Notification, NotificationPreference, WebPushSubscription


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "title", "body", "data", "notification_type", "is_read", "created_at"]


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = [
            "direct_messages",
            "group_messages",
            "sound_enabled",
            "message_preview",
            "web_push_enabled",
            "fcm_enabled",
        ]


class WebPushSubscribeSerializer(serializers.Serializer):
    endpoint = serializers.CharField(required=True)
    p256dh = serializers.CharField(required=True)
    auth = serializers.CharField(required=True)
    device_id = serializers.CharField(required=False, default="browser")

