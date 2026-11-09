from django.db.models import Sum, Count
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from apps.authentication.models import User, UserSession, Report, AuditLog
from apps.chat.models import Conversation
from apps.messages_app.models import Message
from apps.storage_app.models import UserStorageUsage
from apps.outbox.models import MessageOutbox
from apps.outbox.services.redis_streams import get_redis_client


class IsAdminUserPermission:
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and (request.user.role == "admin" or request.user.is_staff))


class AdminVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        is_admin = request.user.role == "admin" or request.user.is_staff or request.user.is_superuser
        return Response({"admin": is_admin, "user": {"id": str(request.user.id), "email": request.user.email, "role": request.user.role}})

    def post(self, request):
        secret_key = request.data.get("secretKey")
        # Support admin secret key fallback or user role
        if request.user.is_authenticated and (request.user.role == "admin" or request.user.is_staff):
            return Response({"success": True, "message": "Admin verified."})
        return Response({"success": False, "message": "Unauthorized."}, status=status.HTTP_403_FORBIDDEN)


class AdminLogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"success": True, "message": "Admin logged out."})


class AdminStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (request.user.role == "admin" or request.user.is_staff or request.user.is_superuser):
            return Response({"success": False, "message": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        total_users = User.objects.count()
        active_users = User.objects.filter(is_active=True).count()
        active_sessions = UserSession.objects.filter(is_revoked=False, expires_at__gt=timezone.now()).count()
        total_chats = Conversation.objects.count()
        total_messages = Message.objects.count()
        storage_sum = UserStorageUsage.objects.aggregate(total=Sum("bytes_used"))["total"] or 0

        # Outbox & Redis Stream status
        pending_outbox = MessageOutbox.objects.filter(status="pending").count()
        failed_outbox = MessageOutbox.objects.filter(status="failed").count()

        redis_client = get_redis_client()
        redis_ok = False
        redis_memory = "N/A"
        if redis_client:
            try:
                info = redis_client.info("memory")
                redis_ok = True
                redis_memory = info.get("used_memory_human", "N/A")
            except Exception:
                pass

        return Response({
            "success": True,
            "stats": {
                "usersCount": total_users,
                "activeUsersCount": active_users,
                "activeSessions": active_sessions,
                "totalChatsCount": total_chats,
                "messagesCount": total_messages,
                "storageUsedBytes": storage_sum,
                "storageUsedMB": round(storage_sum / (1024 * 1024), 2),
                "pendingOutboxEvents": pending_outbox,
                "failedOutboxEvents": failed_outbox,
                "redisStatus": "connected" if redis_ok else "disconnected",
                "redisMemory": redis_memory,
                "serverTime": timezone.now().isoformat(),
            }
        })


class AdminUsersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (request.user.role == "admin" or request.user.is_staff):
            return Response({"success": False, "message": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        users = User.objects.all().order_by("-created_at")[:100]
        data = [{
            "_id": str(u.id),
            "name": u.name,
            "username": u.username,
            "email": u.email,
            "role": u.role,
            "status": u.status,
            "isActive": u.is_active,
            "avatar": u.avatar.get("url") if isinstance(u.avatar, dict) else None,
            "createdAt": u.created_at.isoformat(),
        } for u in users]
        return Response({"success": True, "users": data})


class AdminUserSuspendView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        if not (request.user.role == "admin" or request.user.is_staff):
            return Response({"success": False, "message": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        target = User.objects.filter(id=user_id).first()
        if not target:
            return Response({"success": False, "message": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        target.is_active = not target.is_active
        target.save(update_fields=["is_active"])

        # Revoke active sessions if suspended
        if not target.is_active:
            UserSession.objects.filter(user=target).update(is_revoked=True)

        AuditLog.objects.create(
            user=request.user,
            action=f"USER_{'SUSPENDED' if not target.is_active else 'RESTORED'}",
            details={"target_user_id": str(target.id), "target_email": target.email}
        )

        return Response({"success": True, "isActive": target.is_active, "message": f"User {'suspended' if not target.is_active else 'activated'}."})


class AdminChatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (request.user.role == "admin" or request.user.is_staff):
            return Response({"success": False, "message": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        chats = Conversation.objects.annotate(
            total_members=Count("member_records"),
            total_messages=Count("messages")
        ).order_by("-updated_at")[:100]

        data = [{
            "_id": str(c.id),
            "name": c.name or f"Chat {c.id}",
            "groupChat": c.group_chat,
            "totalMembers": c.total_members,
            "totalMessages": c.total_messages,
            "createdAt": c.created_at.isoformat(),
        } for c in chats]
        return Response({"success": True, "chats": data})


class AdminMessagesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (request.user.role == "admin" or request.user.is_staff):
            return Response({"success": False, "message": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        # High-level privacy-preserving message metadata (does not expose private message content)
        messages = Message.objects.select_related("sender", "conversation").order_by("-created_at")[:100]
        data = [{
            "_id": str(m.id),
            "chatId": str(m.conversation_id),
            "senderName": m.sender.name or m.sender.username,
            "messageType": m.message_type,
            "isDeleted": m.is_deleted,
            "isEdited": m.is_edited,
            "createdAt": m.created_at.isoformat(),
        } for m in messages]
        return Response({"success": True, "messages": data})


class AdminReportsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (request.user.role == "admin" or request.user.is_staff):
            return Response({"success": False, "message": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        reports = Report.objects.select_related("reporter", "reported_user").order_by("-created_at")[:50]
        data = [{
            "id": str(r.id),
            "reporter": r.reporter.username,
            "reportedUser": r.reported_user.username,
            "reason": r.reason,
            "status": r.status,
            "createdAt": r.created_at.isoformat(),
        } for r in reports]
        return Response({"success": True, "reports": data})


class AdminAuditLogsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not (request.user.role == "admin" or request.user.is_staff):
            return Response({"success": False, "message": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        logs = AuditLog.objects.select_related("user").order_by("-created_at")[:100]
        data = [{
            "id": str(l.id),
            "user": l.user.email if l.user else "System",
            "action": l.action,
            "ipAddress": l.ip_address,
            "details": l.details,
            "createdAt": l.created_at.isoformat(),
        } for l in logs]
        return Response({"success": True, "auditLogs": data})

