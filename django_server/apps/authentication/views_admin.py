from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authentication.models import AuditLog, Report, User, UserSession
from apps.authentication.services.admin_analytics_service import AdminAnalyticsService
from apps.authentication.services.session_service import SessionService
from apps.chat.models import Conversation
from apps.messages_app.models import Message


def _is_admin(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (getattr(user, "role", "user") == "admin" or user.is_staff or user.is_superuser)
    )


class IsAdminUserPermission:
    def has_permission(self, request, view):
        return _is_admin(request.user)


class AdminVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        is_admin = _is_admin(request.user)
        return Response({
            "admin": is_admin,
            "user": {
                "id": str(request.user.id),
                "email": request.user.email,
                "role": request.user.role,
                "is_staff": request.user.is_staff,
                "is_superuser": request.user.is_superuser,
            },
        })

    def post(self, request):
        if _is_admin(request.user):
            return Response({"success": True, "message": "Admin verified."})
        return Response({"success": False, "message": "Unauthorized."}, status=status.HTTP_403_FORBIDDEN)


class AdminLogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"success": True, "message": "Admin logged out."})


class AdminStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_admin(request.user):
            return Response({"success": False, "message": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        stats = AdminAnalyticsService.get_dashboard_analytics()
        return Response({"success": True, "stats": stats})


class AdminUsersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_admin(request.user):
            return Response({"success": False, "message": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        q = (request.query_params.get("q") or "").strip()
        include_loadtest = request.query_params.get("include_loadtest", "0") == "1"

        qs = User.objects.select_related("mfa").all()
        if not include_loadtest and not q:
            qs = qs.exclude(email__endswith="@loadtest.local")
        if q:
            qs = qs.filter(Q(email__icontains=q) | Q(username__icontains=q) | Q(name__icontains=q))

        users = qs.order_by("-created_at")[:100]
        data = [{
            "_id": str(u.id),
            "name": u.name,
            "username": u.username,
            "email": u.email,
            "role": u.role,
            "isStaff": u.is_staff,
            "isSuperuser": u.is_superuser,
            "mfaEnabled": bool(getattr(getattr(u, "mfa", None), "is_enabled", False)),
            "status": u.status,
            "isActive": u.is_active,
            "avatar": u.avatar.get("url") if isinstance(u.avatar, dict) else None,
            "createdAt": u.created_at.isoformat(),
        } for u in users]
        return Response({"success": True, "users": data})


class AdminUserSuspendView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        if not _is_admin(request.user):
            return Response({"success": False, "message": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        target = User.objects.filter(id=user_id).first()
        if not target:
            return Response({"success": False, "message": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        target.is_active = not target.is_active
        target.save(update_fields=["is_active"])

        if not target.is_active:
            SessionService.mark_user_sessions_revoked(target)

        AuditLog.objects.create(
            user=request.user,
            action=f"USER_{'SUSPENDED' if not target.is_active else 'RESTORED'}",
            details={"target_user_id": str(target.id), "target_email": target.email},
        )

        return Response({"success": True, "isActive": target.is_active, "message": f"User {'suspended' if not target.is_active else 'activated'}."})


class AdminSessionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_admin(request.user):
            return Response({"success": False, "message": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        now = timezone.now()
        sessions = (
            UserSession.objects.filter(is_revoked=False, expires_at__gt=now)
            .select_related("user", "device")
            .order_by("-created_at")[:100]
        )
        data = [{
            "id": str(s.id),
            "userEmail": s.user.email,
            "username": s.user.username,
            "deviceName": (s.device.device_name or s.device.platform) if s.device else "Unknown",
            "platform": s.device.platform if s.device else "web",
            "authMethod": s.auth_method,
            "ipAddress": s.ip_address,
            "createdAt": s.created_at.isoformat(),
            "expiresAt": s.expires_at.isoformat(),
        } for s in sessions]
        return Response({"success": True, "sessions": data})


class AdminRevokeSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, session_id):
        if not _is_admin(request.user):
            return Response({"success": False, "message": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        session = UserSession.objects.select_related("user").filter(id=session_id).first()
        if not session:
            return Response({"success": False, "message": "Session not found."}, status=status.HTTP_404_NOT_FOUND)

        SessionService.revoke_session(session.user, str(session.id))
        AuditLog.objects.create(
            user=request.user,
            action="ADMIN_SESSION_REVOKED",
            details={"target_user": session.user.email, "session_id": str(session.id)},
        )
        return Response({"success": True, "message": "Session revoked immediately."})


class AdminChatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _is_admin(request.user):
            return Response({"success": False, "message": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        chats = Conversation.objects.annotate(
            total_members=Count("member_records"),
            total_messages=Count("messages"),
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
        if not _is_admin(request.user):
            return Response({"success": False, "message": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

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
        if not _is_admin(request.user):
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
        if not _is_admin(request.user):
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
