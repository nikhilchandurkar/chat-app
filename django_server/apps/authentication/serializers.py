from rest_framework import serializers
from .models import User, UserProfile, Request, SocialAccount, Device, UserSession


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = [
            "display_name",
            "avatar_url",
            "about",
            "online_status",
            "last_seen",
            "privacy_avatar",
            "privacy_online",
            "privacy_last_seen",
            "hide_from_search",
            "privacy_read_receipts",
            "privacy_typing_indicator",
            "who_can_add_to_groups",
            "who_can_message_me",
        ]


class UserSerializer(serializers.ModelSerializer):
    _id = serializers.CharField(source="id", read_only=True)
    id = serializers.CharField(read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    profile = UserProfileSerializer(read_only=True)
    mfa_enabled = serializers.SerializerMethodField()

    def get_mfa_enabled(self, obj):
        try:
            return bool(obj.mfa.is_enabled)
        except Exception:
            return False

    class Meta:
        model = User
        fields = [
            "_id",
            "id",
            "name",
            "username",
            "email",
            "bio",
            "avatar",
            "status",
            "privacy",
            "role",
            "is_staff",
            "is_superuser",
            "mfa_enabled",
            "starred_messages",
            "profile",
            "created_at",
            "createdAt",
        ]


class PasswordLoginSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    password = serializers.CharField(required=True, write_only=True)
    device_id = serializers.CharField(required=False, default="web-client")
    device_name = serializers.CharField(required=False, allow_blank=True, default="")
    platform = serializers.ChoiceField(choices=["android", "web", "ios"], default="web")
    app_version = serializers.CharField(required=False, default="1.0.0")
    replace_session_id = serializers.CharField(required=False, allow_blank=True, default="")


class RegisterRequestSerializer(serializers.Serializer):
    username = serializers.CharField(required=True, min_length=3, max_length=30)
    email = serializers.EmailField(required=True)
    password = serializers.CharField(required=True, min_length=8, write_only=True)
    confirm_password = serializers.CharField(required=True, min_length=8, write_only=True)
    name = serializers.CharField(required=False, allow_blank=True, default="")


class RegisterVerifySerializer(serializers.Serializer):
    username = serializers.CharField(required=True, min_length=3, max_length=30)
    email = serializers.EmailField(required=True)
    password = serializers.CharField(required=True, min_length=8, write_only=True)
    otp = serializers.CharField(required=True, min_length=6, max_length=6)
    name = serializers.CharField(required=False, allow_blank=True, default="")
    device_id = serializers.CharField(required=False, default="web-client")
    platform = serializers.ChoiceField(choices=["android", "web", "ios"], default="web")
    app_version = serializers.CharField(required=False, default="1.0.0")


class RequestOTPSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    purpose = serializers.ChoiceField(choices=["login", "register", "recovery"], default="login")


class VerifyOTPSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    otp = serializers.CharField(required=True, min_length=6, max_length=6)
    device_id = serializers.CharField(required=False, default="web-client")
    device_name = serializers.CharField(required=False, allow_blank=True, default="")
    platform = serializers.ChoiceField(choices=["android", "web", "ios"], default="web")
    app_version = serializers.CharField(required=False, default="1.0.0")
    replace_session_id = serializers.CharField(required=False, allow_blank=True, default="")


class GoogleAuthSerializer(serializers.Serializer):
    id_token = serializers.CharField(required=False, allow_blank=True, default="")
    code = serializers.CharField(required=False, allow_blank=True, default="")
    redirect_uri = serializers.CharField(required=False, allow_blank=True, default="")
    device_id = serializers.CharField(required=False, default="client")
    platform = serializers.ChoiceField(choices=["android", "web", "ios"], default="web")
    app_version = serializers.CharField(required=False, default="1.0.0")


class GitHubAuthSerializer(serializers.Serializer):
    code = serializers.CharField(required=True)
    redirect_uri = serializers.CharField(required=False, allow_blank=True, default="")
    device_id = serializers.CharField(required=False, default="client")
    platform = serializers.ChoiceField(choices=["android", "web", "ios"], default="web")
    app_version = serializers.CharField(required=False, default="1.0.0")


class FacebookAuthSerializer(serializers.Serializer):
    access_token = serializers.CharField(required=True)
    device_id = serializers.CharField(required=False, default="client")
    platform = serializers.ChoiceField(choices=["android", "web", "ios"], default="web")
    app_version = serializers.CharField(required=False, default="1.0.0")


class SocialAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = SocialAccount
        fields = ["id", "provider", "email", "created_at"]


class DeviceRegisterSerializer(serializers.Serializer):
    device_id = serializers.CharField(required=True)
    platform = serializers.ChoiceField(choices=["android", "web", "ios"], default="android")
    app_version = serializers.CharField(required=False, default="1.0.0")
    native_fcm_token = serializers.CharField(required=False, allow_blank=True, default="")


class SessionSerializer(serializers.ModelSerializer):
    device_id = serializers.CharField(source="device.device_id", read_only=True)
    platform = serializers.CharField(source="device.platform", read_only=True)

    class Meta:
        model = UserSession
        fields = ["id", "device_id", "platform", "ip_address", "user_agent", "created_at", "expires_at", "is_revoked"]


class FriendRequestSerializer(serializers.ModelSerializer):
    _id = serializers.CharField(source="id", read_only=True)
    sender = UserSerializer(read_only=True)
    receiver = UserSerializer(read_only=True)

    class Meta:
        model = Request
        fields = ["_id", "sender", "receiver", "status", "created_at"]


class MFACodeSerializer(serializers.Serializer):
    code = serializers.CharField(required=True, min_length=6, max_length=16)


class MFALoginVerifySerializer(serializers.Serializer):
    mfa_token = serializers.CharField(required=True)
    code = serializers.CharField(required=True, min_length=6, max_length=16)
    replace_session_id = serializers.CharField(required=False, allow_blank=True, default="")


class MFADisableSerializer(serializers.Serializer):
    password = serializers.CharField(required=False, allow_blank=True, default="")
    code = serializers.CharField(required=True, min_length=6, max_length=16)


class ResolveDeviceLimitSerializer(serializers.Serializer):
    device_limit_token = serializers.CharField(required=True)
    replace_session_id = serializers.CharField(required=True)


class QRCreateSerializer(serializers.Serializer):
    device_id = serializers.CharField(required=False, allow_blank=True, default="")
    device_name = serializers.CharField(required=False, allow_blank=True, default="Web Browser")
    platform = serializers.ChoiceField(choices=["android", "web", "ios"], default="web")


class QRApproveSerializer(serializers.Serializer):
    qr_token = serializers.CharField(required=True)
    replace_session_id = serializers.CharField(required=False, allow_blank=True, default="")


class QRClaimSerializer(serializers.Serializer):
    qr_token = serializers.CharField(required=True)
    claim_secret = serializers.CharField(required=True)
    replace_session_id = serializers.CharField(required=False, allow_blank=True, default="")
