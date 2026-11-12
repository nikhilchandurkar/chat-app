from datetime import timedelta
import uuid
from django.core.files.storage import default_storage
from django.utils import timezone
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from apps.authentication.models import User, BlockedUser, Contact
from apps.storage_app.services.file_validator import sanitize_filename, validate_file_header
from .models import UserStatus, StatusView, StatusReaction
from .serializers import UserStatusSerializer, StatusViewerSerializer


class CreateStatusView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        status_type = request.data.get("status_type", "text").lower().strip()
        content = request.data.get("content", "").strip()
        background_color = request.data.get("background_color", "#4f46e5")
        font_style = request.data.get("font_style", "sans-serif")
        privacy = request.data.get("privacy", "everyone")
        media_file = request.FILES.get("media")

        if status_type not in ("text", "image", "video"):
            return Response({"success": False, "message": "Invalid status_type."}, status=status.HTTP_400_BAD_REQUEST)

        media_url = ""
        media_path = ""
        if status_type in ("image", "video"):
            if not media_file:
                return Response({"success": False, "message": f"Media file is required for {status_type} status."}, status=status.HTTP_400_BAD_REQUEST)

            file_name = sanitize_filename(media_file.name)
            header_bytes = media_file.read(16)
            media_file.seek(0)
            valid, err = validate_file_header(header_bytes, file_name)
            if not valid:
                return Response({"success": False, "message": err}, status=status.HTTP_400_BAD_REQUEST)

            saved_name = default_storage.save(f"statuses/{request.user.id}_{uuid.uuid4().hex[:8]}_{file_name}", media_file)
            media_url = f"/api/v1/media/{saved_name}"
            media_path = saved_name
        elif not content:
            return Response({"success": False, "message": "Text status content cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            new_status = UserStatus.objects.create(
                user=request.user,
                status_type=status_type,
                content=content,
                media_path=media_path,
                media_url=media_url,
                background_color=background_color,
                font_style=font_style,
                privacy=privacy,
                expires_at=timezone.now() + timedelta(hours=24)
            )

            # Assign allowed / excluded users if specified
            if privacy == "selected":
                allowed_ids = request.data.get("allowed_users", [])
                new_status.allowed_users.set(User.objects.filter(id__in=allowed_ids))
            elif privacy == "exclude":
                excluded_ids = request.data.get("excluded_users", [])
                new_status.excluded_users.set(User.objects.filter(id__in=excluded_ids))

        return Response({
            "success": True,
            "message": "Status published successfully.",
            "status": UserStatusSerializer(new_status, context={"request": request}).data
        }, status=status.HTTP_201_CREATED)


class StatusFeedView(APIView):
    """Retrieves active statuses of contacts / connections respecting privacy and blocking."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        # Find contacts / direct chat friends
        from apps.chat.models import ConversationMember
        contact_ids = set(Contact.objects.filter(user=request.user).values_list("contact_user_id", flat=True))
        direct_conv_ids = ConversationMember.objects.filter(
            user=request.user, conversation__type="direct"
        ).values_list("conversation_id", flat=True)
        friend_ids = ConversationMember.objects.filter(
            conversation_id__in=direct_conv_ids
        ).exclude(user=request.user).values_list("user_id", flat=True)
        contact_ids |= set(friend_ids)

        # Blocked users
        blocked_ids = set(BlockedUser.objects.filter(user=request.user).values_list("blocked_user_id", flat=True))
        blocked_by_ids = set(BlockedUser.objects.filter(blocked_user=request.user).values_list("user_id", flat=True))
        forbidden_user_ids = blocked_ids | blocked_by_ids

        # Fetch active statuses
        all_active = UserStatus.objects.filter(
            expires_at__gt=now
        ).exclude(
            user=request.user
        ).exclude(
            user_id__in=forbidden_user_ids
        ).select_related("user").prefetch_related("views", "reactions", "allowed_users", "excluded_users").order_by("-created_at")

        visible_statuses = []
        for s in all_active:
            # Privacy policy evaluation
            if s.privacy == "contacts" and s.user_id not in contact_ids:
                continue
            elif s.privacy == "selected" and not s.allowed_users.filter(id=request.user.id).exists():
                continue
            elif s.privacy == "exclude" and s.excluded_users.filter(id=request.user.id).exists():
                continue

            visible_statuses.append(s)

        # Group by user
        grouped = {}
        for s in visible_statuses:
            uid = str(s.user.id)
            if uid not in grouped:
                grouped[uid] = {
                    "user": {
                        "id": uid,
                        "name": s.user.name or s.user.username,
                        "username": s.user.username,
                        "avatar": s.user.avatar,
                    },
                    "statuses": [],
                }
            grouped[uid]["statuses"].append(UserStatusSerializer(s, context={"request": request}).data)

        return Response({"success": True, "feed": list(grouped.values())})


class MyStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        my_statuses = UserStatus.objects.filter(
            user=request.user,
            expires_at__gt=now
        ).prefetch_related("views", "reactions").order_by("-created_at")

        return Response({
            "success": True,
            "statuses": UserStatusSerializer(my_statuses, many=True, context={"request": request}).data
        })


class DeleteStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, id):
        status_obj = get_object_or_404(UserStatus, id=id)
        if status_obj.user != request.user and not request.user.is_staff:
            return Response({"success": False, "message": "Only the author can delete this status."}, status=status.HTTP_403_FORBIDDEN)

        status_obj.delete()
        return Response({"success": True, "message": "Status deleted."})


class RecordStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        status_obj = get_object_or_404(UserStatus, id=id)
        if status_obj.is_expired:
            return Response({"success": False, "message": "Status has expired."}, status=status.HTTP_400_BAD_REQUEST)

        # Author viewing their own status does not count as a recipient view
        if status_obj.user != request.user:
            # Check viewer privacy preference
            profile = getattr(request.user, "profile", None)
            if not profile or profile.privacy_read_receipts:
                StatusView.objects.get_or_create(status=status_obj, viewer=request.user)

        return Response({"success": True, "message": "View recorded."})


class GetStatusViewersView(APIView):
    """Only the status author may inspect the viewer list (IDOR protection)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        status_obj = get_object_or_404(UserStatus, id=id)
        if status_obj.user != request.user:
            return Response({"success": False, "message": "Access denied. Only the author can view the viewers list."}, status=status.HTTP_403_FORBIDDEN)

        views = status_obj.views.select_related("viewer").all()
        reactions = status_obj.reactions.select_related("user").order_by("-created_at")
        reactions_data = [
            {
                "id": str(r.id),
                "reaction": r.reaction,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "user": {
                    "id": str(r.user_id),
                    "name": r.user.name or r.user.username,
                    "username": r.user.username,
                    "avatar": r.user.avatar,
                },
            }
            for r in reactions
        ]
        return Response({
            "success": True,
            "viewers": StatusViewerSerializer(views, many=True).data,
            "totalViews": views.count(),
            "reactions": reactions_data,
            "totalReactions": len(reactions_data),
        })


class ReactStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        status_obj = get_object_or_404(UserStatus, id=id)
        if status_obj.is_expired:
            return Response({"success": False, "message": "Status has expired."}, status=status.HTTP_400_BAD_REQUEST)

        emoji = request.data.get("reaction", "").strip()
        if not emoji:
            return Response({"success": False, "message": "Reaction emoji required."}, status=status.HTTP_400_BAD_REQUEST)

        StatusReaction.objects.update_or_create(
            status=status_obj,
            user=request.user,
            defaults={"reaction": emoji}
        )
        all_reactions = [
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
            for r in status_obj.reactions.select_related("user").order_by("-created_at")
        ]

        return Response({"success": True, "message": "Reaction added.", "reactions": all_reactions})

