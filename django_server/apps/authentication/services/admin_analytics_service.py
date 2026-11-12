"""Shared platform analytics & metrics service powering Django Admin & React Admin Dashboard."""

from __future__ import annotations

from datetime import timedelta

from django.db.models import Count, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from apps.authentication.models import Device, QRLoginSession, User, UserMFA, UserSession
from apps.chat.models import Conversation
from apps.messages_app.models import Message
from apps.outbox.models import MessageOutbox
from apps.outbox.services.redis_streams import get_redis_client
from apps.storage_app.models import UserStorageUsage


class AdminAnalyticsService:
    DJANGO_ADMIN_MAP = {
        "index": "/admin/",
        "users": "/admin/authentication/user/",
        "profiles": "/admin/authentication/userprofile/",
        "sessions": "/admin/authentication/usersession/",
        "devices": "/admin/authentication/device/",
        "mfa": "/admin/authentication/usermfa/",
        "qrLogins": "/admin/authentication/qrloginsession/",
        "auditLogs": "/admin/authentication/auditlog/",
        "reports": "/admin/authentication/report/",
        "chats": "/admin/chat/conversation/",
        "messages": "/admin/messages_app/message/",
        "outbox": "/admin/outbox/messageoutbox/",
        "storage": "/admin/storage_app/userstorageusage/",
    }

    @classmethod
    def get_dashboard_analytics(cls) -> dict:
        now = timezone.now()
        seven_days_ago = (now - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)

        total_users = User.objects.count()
        loadtest_users = User.objects.filter(email__endswith="@loadtest.local").count()
        real_users = max(0, total_users - loadtest_users)
        active_users = User.objects.filter(is_active=True).count()
        active_sessions = UserSession.objects.filter(is_revoked=False, expires_at__gt=now).count()
        mfa_enabled_count = UserMFA.objects.filter(is_enabled=True).count()
        qr_approved_count = QRLoginSession.objects.filter(status__in=["approved", "claimed"]).count()

        total_chats = Conversation.objects.count()
        group_chats = Conversation.objects.filter(group_chat=True).count()
        total_messages = Message.objects.count()
        storage_sum = UserStorageUsage.objects.aggregate(total=Sum("bytes_used"))["total"] or 0

        pending_outbox = MessageOutbox.objects.filter(status="pending").count()
        failed_outbox = MessageOutbox.objects.filter(status="failed").count()
        processed_outbox = MessageOutbox.objects.filter(status="processed").count()

        # 7-day daily activity chart series (excluding synthetic load-test bulk users from signup curve if helpful, keep messages total)
        day_labels = [(seven_days_ago + timedelta(days=i)).date() for i in range(7)]
        users_by_day = {
            row["day"]: row["cnt"]
            for row in User.objects.filter(created_at__gte=seven_days_ago)
            .exclude(email__endswith="@loadtest.local")
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(cnt=Count("id"))
        }
        msgs_by_day = {
            row["day"]: row["cnt"]
            for row in Message.objects.filter(created_at__gte=seven_days_ago)
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(cnt=Count("id"))
        }
        daily_activity = [
            {
                "date": d.isoformat(),
                "label": d.strftime("%b %d"),
                "users": users_by_day.get(d, 0),
                "messages": msgs_by_day.get(d, 0),
            }
            for d in day_labels
        ]

        # Platform breakdown
        device_platforms = [
            {"label": row["platform"] or "unknown", "count": row["cnt"]}
            for row in Device.objects.values("platform").annotate(cnt=Count("id")).order_by("-cnt")
        ]

        # Auth method breakdown among active sessions
        auth_methods = [
            {"label": row["auth_method"] or "password", "count": row["cnt"]}
            for row in UserSession.objects.filter(is_revoked=False, expires_at__gt=now)
            .values("auth_method")
            .annotate(cnt=Count("id"))
            .order_by("-cnt")
        ]

        # Message type distribution
        message_types = [
            {"label": row["message_type"] or "text", "count": row["cnt"]}
            for row in Message.objects.values("message_type").annotate(cnt=Count("id")).order_by("-cnt")
        ]

        redis_client = get_redis_client()
        redis_ok = False
        redis_memory = "N/A"
        redis_clients = 0
        if redis_client:
            try:
                info_mem = redis_client.info("memory")
                info_cli = redis_client.info("clients")
                redis_ok = True
                redis_memory = info_mem.get("used_memory_human", "N/A")
                redis_clients = info_cli.get("connected_clients", 0)
            except Exception:
                pass

        return {
            "usersCount": total_users,
            "realUsersCount": real_users,
            "loadTestUsersCount": loadtest_users,
            "activeUsersCount": active_users,
            "activeSessions": active_sessions,
            "mfaEnabledCount": mfa_enabled_count,
            "qrApprovedCount": qr_approved_count,
            "totalChatsCount": total_chats,
            "groupChatsCount": group_chats,
            "messagesCount": total_messages,
            "storageUsedBytes": storage_sum,
            "storageUsedMB": round(storage_sum / (1024 * 1024), 2),
            "pendingOutboxEvents": pending_outbox,
            "failedOutboxEvents": failed_outbox,
            "processedOutboxEvents": processed_outbox,
            "redisStatus": "connected" if redis_ok else "disconnected",
            "redisMemory": redis_memory,
            "redisClients": redis_clients,
            "dailyActivity": daily_activity,
            "devicePlatforms": device_platforms,
            "authMethods": auth_methods,
            "messageTypes": message_types,
            "djangoAdminUrls": cls.DJANGO_ADMIN_MAP,
            "serverTime": now.isoformat(),
        }

