from rest_framework import serializers
from .models import User, Request


class UserSerializer(serializers.ModelSerializer):
    _id = serializers.CharField(source="id", read_only=True)

    class Meta:
        model = User
        fields = [
            "_id",
            "name",
            "username",
            "email",
            "bio",
            "avatar",
            "status",
            "privacy",
            "role",
            "starred_messages",
            "created_at",
        ]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ["name", "username", "email", "password", "bio"]

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    password = serializers.CharField(required=True)


class RequestOTPSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)


class VerifyOTPSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    otp = serializers.CharField(required=True, max_length=6, min_length=6)


class FriendRequestSerializer(serializers.ModelSerializer):
    _id = serializers.CharField(source="id", read_only=True)
    sender = UserSerializer(read_only=True)
    receiver = UserSerializer(read_only=True)

    class Meta:
        model = Request
        fields = ["_id", "sender", "receiver", "status", "created_at"]
