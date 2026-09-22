from django.shortcuts import get_object_or_404
from django.core.paginator import Paginator
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from apps.chat.models import Chat
from .models import Message, encrypt_message
from .serializers import MessageSerializer


def emit_socket_event(event_name, data, user_ids):
    """Helper to broadcast real-time events to user Channels groups."""
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
    for uid in user_ids:
        async_to_sync(channel_layer.group_send)(
            f"user_{uid}",
            {
                "type": "chat.event",
                "event": event_name,
                "data": data,
            }
        )


class SearchMessagesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, chat_id):
        chat = get_object_or_404(Chat, id=chat_id)
        if not chat.members.filter(id=request.user.id).exists():
            return Response({"success": False, "message": "Unauthorized"}, status=status.HTTP_403_FORBIDDEN)

        query = request.query_params.get("q", "").strip().lower()
        page = int(request.query_params.get("page", 1))
        limit = 15

        all_messages = Message.objects.filter(chat=chat, is_deleted=False).select_related("sender").order_by("-created_at")
        matched = []
        for m in all_messages:
            decrypted = m.decrypted_content.lower()
            if query in decrypted:
                matched.append({
                    "_id": str(m.id),
                    "content": m.decrypted_content,
                    "sender": {
                        "_id": str(m.sender.id),
                        "name": m.sender.name,
                        "avatar": m.sender.avatar.get("url") if isinstance(m.sender.avatar, dict) else None,
                    },
                    "createdAt": m.created_at.isoformat(),
                })

        paginator = Paginator(matched, limit)
        page_obj = paginator.get_page(page)

        return Response({
            "success": True,
            "messages": list(page_obj),
            "totalPages": paginator.num_pages,
            "currentPage": page,
            "query": query,
        })


class EditMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, id):
        message = get_object_or_404(Message.objects.select_related("chat"), id=id)
        if message.sender_id != request.user.id:
            return Response({"success": False, "message": "Only sender can edit message"}, status=status.HTTP_403_FORBIDDEN)

        new_content = request.data.get("content", "").strip()
        if not new_content:
            return Response({"success": False, "message": "Content cannot be empty"}, status=status.HTTP_400_BAD_REQUEST)

        message.content = encrypt_message(new_content)
        message.is_edited = True
        message.save(update_fields=["content", "is_edited"])

        all_member_ids = [str(m.id) for m in message.chat.members.all()]
        emit_socket_event("MESSAGE_EDITED", {
            "messageId": str(message.id),
            "chatId": str(message.chat.id),
            "content": new_content,
            "isEdited": True,
        }, all_member_ids)

        return Response({
            "success": True,
            "message": "Message edited successfully",
            "data": {
                "content": new_content,
                "isEdited": True,
            }
        })

    def delete(self, request, id):
        message = get_object_or_404(Message.objects.select_related("chat"), id=id)
        is_sender = message.sender_id == request.user.id
        is_creator = message.chat.creator_id == request.user.id

        if not (is_sender or is_creator):
            return Response({"success": False, "message": "Unauthorized to delete message"}, status=status.HTTP_403_FORBIDDEN)

        message.is_deleted = True
        message.save(update_fields=["is_deleted"])

        all_member_ids = [str(m.id) for m in message.chat.members.all()]
        emit_socket_event("MESSAGE_DELETED", {
            "messageId": str(message.id),
            "chatId": str(message.chat.id),
        }, all_member_ids)

        return Response({"success": True, "message": "Message deleted successfully"})


class ReactMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        message = get_object_or_404(Message.objects.select_related("chat"), id=id)
        emoji = request.data.get("emoji")
        if not emoji:
            return Response({"success": False, "message": "Emoji is required"}, status=status.HTTP_400_BAD_REQUEST)

        user_id_str = str(request.user.id)
        reactions = list(message.reactions or [])

        # Check if user already reacted with this emoji (toggle)
        existing_idx = None
        for i, r in enumerate(reactions):
            if r.get("user", {}).get("_id") == user_id_str:
                existing_idx = i
                break

        if existing_idx is not None:
            if reactions[existing_idx].get("emoji") == emoji:
                reactions.pop(existing_idx)
                action = "removed"
            else:
                reactions[existing_idx]["emoji"] = emoji
                action = "updated"
        else:
            reactions.append({
                "user": {
                    "_id": user_id_str,
                    "name": request.user.name,
                    "avatar": request.user.avatar.get("url") if isinstance(request.user.avatar, dict) else None,
                },
                "emoji": emoji
            })
            action = "added"

        message.reactions = reactions
        message.save(update_fields=["reactions"])

        all_member_ids = [str(m.id) for m in message.chat.members.all()]
        emit_socket_event("MESSAGE_REACTED", {
            "messageId": str(message.id),
            "chatId": str(message.chat.id),
            "reactions": reactions,
        }, all_member_ids)

        return Response({
            "success": True,
            "message": f"Reaction {action}",
            "reactions": reactions,
        })


class ForwardMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        message_id = request.data.get("messageId")
        target_chat_ids = request.data.get("targetChatIds", [])

        orig_message = get_object_or_404(Message, id=message_id)

        for cid in target_chat_ids:
            chat = Chat.objects.filter(id=cid, members=request.user).first()
            if not chat:
                continue

            forwarded = Message.objects.create(
                sender=request.user,
                chat=chat,
                content=orig_message.content,  # already encrypted
                attachments=orig_message.attachments,
            )

            msg_data = {
                "_id": str(forwarded.id),
                "content": forwarded.decrypted_content,
                "sender": {
                    "_id": str(request.user.id),
                    "name": request.user.name,
                    "avatar": request.user.avatar.get("url") if isinstance(request.user.avatar, dict) else None,
                },
                "chat": str(chat.id),
                "attachments": forwarded.attachments or [],
                "isEdited": False,
                "isDeleted": False,
                "reactions": [],
                "replyTo": None,
                "readBy": [],
                "createdAt": forwarded.created_at.isoformat(),
            }

            all_member_ids = [str(m.id) for m in chat.members.all()]
            emit_socket_event("NEW_MESSAGE", {"chatId": str(chat.id), "message": msg_data}, all_member_ids)
            emit_socket_event("NEW_MESSAGE_ALERT", {"chatId": str(chat.id)}, all_member_ids)

        return Response({"success": True, "message": "Message forwarded successfully"})


class GetMediaView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, chat_id):
        chat = get_object_or_404(Chat, id=chat_id)
        if not chat.members.filter(id=request.user.id).exists():
            return Response({"success": False, "message": "Unauthorized"}, status=status.HTTP_403_FORBIDDEN)

        page = int(request.query_params.get("page", 1))
        limit = 30

        # Messages with non-empty attachments
        messages_qs = Message.objects.filter(chat=chat, attachments__isnull=False).exclude(attachments=[]).select_related("sender").order_by("-created_at")
        paginator = Paginator(messages_qs, limit)
        page_obj = paginator.get_page(page)

        results = []
        for m in page_obj:
            results.append({
                "_id": str(m.id),
                "attachments": m.attachments,
                "sender": {
                    "_id": str(m.sender.id),
                    "name": m.sender.name,
                    "avatar": m.sender.avatar.get("url") if isinstance(m.sender.avatar, dict) else None,
                },
                "createdAt": m.created_at.isoformat(),
            })

        return Response({
            "success": True,
            "messages": results,
            "totalPages": paginator.num_pages,
            "currentPage": page,
        })

