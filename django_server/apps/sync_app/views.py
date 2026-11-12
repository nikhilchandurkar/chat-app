from datetime import datetime
from django.utils import timezone
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from apps.chat.models import Conversation, ConversationMember
from apps.messages_app.models import Message, MessageReceipt, MessageReaction, DeletedMessageForUser
from apps.messages_app.serializers import MessageSerializer
from apps.authentication.models import Device


class SyncDeltaView(APIView):
    """
    Cursor-based offline synchronization endpoint.
    Returns delta of missed messages, receipts, reactions, and conversation updates.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cursor_str = request.query_params.get("cursor")
        device_id = request.query_params.get("device_id", "")

        user = request.user
        server_now = timezone.now()

        # Update device activity
        if device_id:
            Device.objects.filter(user=user, device_id=device_id).update(last_active_at=server_now)

        # Parse cursor timestamp
        cursor_dt = None
        if cursor_str:
            try:
                cursor_dt = datetime.fromisoformat(cursor_str.replace("Z", "+00:00"))
            except ValueError:
                pass

        # Find all conversations user is a member of
        user_conv_ids = ConversationMember.objects.filter(user=user).values_list("conversation_id", flat=True)

        # 1. Delta Messages (filter before slicing to prevent AssertionError on unordered slices)
        deleted_for_user_ids = DeletedMessageForUser.objects.filter(user=user).values_list("message_id", flat=True)
        msg_query = (
            Message.objects.filter(conversation_id__in=user_conv_ids)
            .exclude(id__in=deleted_for_user_ids)
            .select_related("sender")
        )
        if cursor_dt:
            msg_query = msg_query.filter(Q(created_at__gt=cursor_dt) | Q(updated_at__gt=cursor_dt))
        else:
            msg_query = msg_query.order_by("-created_at")[:50]

        messages = msg_query

        # 2. Delta Receipts
        receipt_query = MessageReceipt.objects.filter(message__conversation_id__in=user_conv_ids)
        if cursor_dt:
            receipt_query = receipt_query.filter(timestamp__gt=cursor_dt)
        else:
            receipt_query = receipt_query.order_by("-timestamp")[:100]

        receipts_data = [{
            "message_id": str(r.message_id),
            "user_id": str(r.user_id),
            "status": r.status,
            "timestamp": r.timestamp.isoformat(),
        } for r in receipt_query]

        # 3. Delta Reactions
        reaction_query = MessageReaction.objects.filter(message__conversation_id__in=user_conv_ids)
        if cursor_dt:
            reaction_query = reaction_query.filter(created_at__gt=cursor_dt)
        else:
            reaction_query = reaction_query.order_by("-created_at")[:100]

        reactions_data = [{
            "message_id": str(rx.message_id),
            "user_id": str(rx.user_id),
            "reaction": rx.reaction,
        } for rx in reaction_query]

        # 4. Deleted Messages for Everyone
        deleted_query = Message.objects.filter(conversation_id__in=user_conv_ids, is_deleted=True)
        if cursor_dt:
            deleted_query = deleted_query.filter(updated_at__gt=cursor_dt)
        deleted_ids = [str(m.id) for m in deleted_query]

        # 5. Conversation Updates
        conv_query = Conversation.objects.filter(id__in=user_conv_ids)
        if cursor_dt:
            conv_query = conv_query.filter(updated_at__gt=cursor_dt)
        conversations_data = [{
            "id": str(c.id),
            "type": c.type,
            "name": c.name,
            "updated_at": c.updated_at.isoformat(),
        } for c in conv_query]

        return Response({
            "success": True,
            "next_cursor": server_now.isoformat(),
            "messages": MessageSerializer(messages, many=True).data,
            "receipts": receipts_data,
            "reactions": reactions_data,
            "deleted_message_ids": deleted_ids,
            "conversations": conversations_data,
        })


class SyncAckView(APIView):
    """Acknowledges synchronization cursor up to timestamp."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        cursor = request.data.get("cursor")
        conversation_id = request.data.get("conversation_id")
        last_message_id = request.data.get("last_message_id")

        if conversation_id and last_message_id:
            ConversationMember.objects.filter(
                user=request.user,
                conversation_id=conversation_id
            ).update(last_read_message_id=last_message_id, unread_count=0)

        return Response({"success": True, "cursor": cursor})

