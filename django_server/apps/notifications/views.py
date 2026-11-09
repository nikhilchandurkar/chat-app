from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.conf import settings
from .models import Notification, NotificationPreference, WebPushSubscription
from .serializers import NotificationSerializer, NotificationPreferenceSerializer, WebPushSubscribeSerializer
from apps.authentication.models import Device


class VapidPublicKeyView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        key = getattr(settings, "VAPID_PUBLIC_KEY", "")
        return Response({"publicKey": key})


class WebPushSubscribeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = WebPushSubscribeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        device = None
        device_id = serializer.validated_data.get("device_id")
        if device_id:
            device = Device.objects.filter(user=request.user, device_id=device_id).first()

        WebPushSubscription.objects.update_or_create(
            user=request.user,
            endpoint=serializer.validated_data["endpoint"],
            defaults={
                "p256dh_key": serializer.validated_data["p256dh"],
                "auth_key": serializer.validated_data["auth"],
                "device": device,
            }
        )
        return Response({"success": True, "message": "Browser subscription registered."})


class NotificationPreferencesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        pref, _ = NotificationPreference.objects.get_or_create(user=request.user)
        return Response({"success": True, "preferences": NotificationPreferenceSerializer(pref).data})

    def put(self, request):
        pref, _ = NotificationPreference.objects.get_or_create(user=request.user)
        serializer = NotificationPreferenceSerializer(pref, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({"success": True, "preferences": serializer.data})
        return Response({"success": False, "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        notifications = Notification.objects.filter(user=request.user)[:50]
        return Response({"success": True, "notifications": NotificationSerializer(notifications, many=True).data})


class MarkAllNotificationsReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        return Response({"success": True, "message": "All notifications marked as read."})

