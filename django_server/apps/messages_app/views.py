import os
import uuid
import mimetypes
from datetime import timedelta
from django.db import transaction, models
from django.db.models import Exists, OuterRef, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.core.files.storage import default_storage
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from apps.authentication.models import BlockedUser
from apps.authentication.throttles import MessageSendThrottle, SearchThrottle
from apps.chat.models import Conversation, ConversationMember
from apps.outbox.services.outbox_service import OutboxService
from .models import (
    Message,
    MessageEdit,
    MessageReceipt,
    MessageReaction,
    MessageAttachment,
    DeletedMessageForUser,
    encrypt_message,
)
from .serializers import MessageSerializer


def get_conversation_recipient_ids(conversation, sender_id):
    return [str(m.user_id) for m in conversation.member_records.exclude(user_id=sender_id)]


class SendMessageView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [MessageSendThrottle]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        chat_id = request.data.get("chatId") or request.data.get("conversation_id")
        content = request.data.get("message") or request.data.get("content", "")
        client_msg_id = request.data.get("client_message_id", "")
        reply_to = request.data.get("reply_to")
        attachments = request.data.get("attachments", [])
        msg_type = request.data.get("message_type", "text")

        if not chat_id:
            return Response({"success": False, "message": "chatId is required."}, status=status.HTTP_400_BAD_REQUEST)

        conversation = get_object_or_404(Conversation, id=chat_id)
        if not conversation.member_records.filter(user=request.user).exists():
            return Response({"success": False, "message": "You are not a member of this conversation."}, status=status.HTTP_403_FORBIDDEN)

        # Process any uploaded multipart files
        uploaded_files = (
            request.FILES.getlist("files")
            or request.FILES.getlist("attachments")
            or request.FILES.getlist("file")
        )
        if uploaded_files:
            attachments = list(attachments) if isinstance(attachments, list) else []
            for up_file in uploaded_files:
                safe_name = os.path.basename(up_file.name).replace(" ", "_")
                filename = default_storage.save(f"attachments/{conversation.id}_{safe_name}", up_file)
                file_url = f"/api/v1/media/{filename}"
                guessed_mime = up_file.content_type or mimetypes.guess_type(safe_name)[0] or "application/octet-stream"
                ext = safe_name.split(".")[-1].lower() if "." in safe_name else ""

                if ext in ("png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "jfif"):
                    f_type = "image"
                elif ext in ("mp4", "webm", "ogg", "mov", "avi", "mkv", "m4v"):
                    f_type = "video"
                elif ext in ("mp3", "wav", "m4a", "aac", "ogg", "flac"):
                    f_type = "audio"
                else:
                    f_type = "document"

                attachments.append({
                    "url": file_url,
                    "path": filename,
                    "name": safe_name,
                    "size": up_file.size,
                    "type": f_type,
                    "mime_type": guessed_mime,
                    "public_id": filename,
                })

            if not msg_type or msg_type == "text":
                msg_type = attachments[0]["type"] if attachments else "text"

        # Check restricted messages setting in groups
        if conversation.restricted_messages and not (conversation.admins.filter(id=request.user.id).exists() or conversation.creator == request.user):
            return Response({"success": False, "message": "Only admins may post messages in this restricted group."}, status=status.HTTP_403_FORBIDDEN)

        # Check user blocking in direct chats
        if not conversation.group_chat:
            other_id = conversation.member_records.exclude(user=request.user).values_list("user_id", flat=True).first()
            if other_id:
                if BlockedUser.objects.filter(
                    Q(user=request.user, blocked_user_id=other_id) | Q(user_id=other_id, blocked_user=request.user)
                ).exists():
                    return Response({"success": False, "message": "Unable to send message due to block status."}, status=status.HTTP_403_FORBIDDEN)

        # Idempotency check: prevent duplicate message on network retries
        if client_msg_id:
            existing = Message.objects.filter(client_message_id=client_msg_id, sender=request.user).first()
            if existing:
                return Response({"success": True, "message": MessageSerializer(existing).data, "duplicate": True})

        # Ephemeral / Disappearing message expiration calculation
        expires_at = None
        if conversation.ephemeral_ttl and conversation.ephemeral_ttl > 0:
            expires_at = timezone.now() + timedelta(seconds=conversation.ephemeral_ttl)

        with transaction.atomic():
            message = Message.objects.create(
                conversation=conversation,
                sender=request.user,
                client_message_id=client_msg_id,
                message_type=msg_type,
                content=content,
                attachments=attachments,
                reply_to=reply_to,
                status="sent",
                expires_at=expires_at,
            )

            # Link attachments in bulk for strict authorization on downloads
            attachment_objs = [
                MessageAttachment(
                    message=message,
                    file_path=att.get("path") or att.get("file_path") or "",
                    file_name=att.get("name") or "file",
                    file_type=att.get("type") or msg_type,
                    file_size=att.get("size") or 0,
                    mime_type=att.get("mime_type") or "application/octet-stream",
                    thumbnail_path=att.get("thumbnail") or "",
                )
                for att in attachments
                if (att.get("path") or att.get("file_path"))
            ]
            if attachment_objs:
                MessageAttachment.objects.bulk_create(attachment_objs)

            # Update conversation timestamp
            conversation.updated_at = timezone.now()
            conversation.save(update_fields=["updated_at"])

            # Increment unread count for recipients
            ConversationMember.objects.filter(
                conversation=conversation
            ).exclude(user=request.user).update(unread_count=models.F("unread_count") + 1)

            recipient_ids = get_conversation_recipient_ids(conversation, request.user.id)

            serialized_msg = MessageSerializer(message).data

            # Record outbox event for reliable publishing and notification
            outbox_entry = OutboxService.create_outbox_event(
                event_type="message.created",
                conversation_id=str(conversation.id),
                payload={
                    "event": "message.created",
                    "legacy_event": "NEW_MESSAGE",
                    "event_id": str(uuid.uuid4()),
                    "conversation_id": str(conversation.id),
                    "chatId": str(conversation.id),
                    "message_id": str(message.id),
                    "sender_id": str(request.user.id),
                    "sender_name": request.user.name or request.user.username,
                    "client_message_id": client_msg_id,
                    "content": content,
                    "attachments": attachments,
                    "reply_to": reply_to,
                    "timestamp": message.created_at.isoformat(),
                    "expires_at": expires_at.isoformat() if expires_at else None,
                    "recipient_ids": recipient_ids,
                    "message": serialized_msg,
                }
            )

        # Publish the newly created outbox item directly without scanning table
        OutboxService.publish_item(outbox_entry)

        return Response({
            "success": True,
            "message": serialized_msg,
        }, status=status.HTTP_201_CREATED)


class GetMessagesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        conversation = get_object_or_404(Conversation, id=id)
        if not conversation.member_records.filter(user=request.user).exists():
            return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        page = max(1, int(request.query_params.get("page", 1)))
        limit = max(1, min(int(request.query_params.get("limit", 25)), 100))
        now = timezone.now()

        # Exclude messages deleted for this user and expired disappearing messages
        messages_qs = (
            Message.objects.filter(conversation=conversation)
            .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
            .filter(~Exists(DeletedMessageForUser.objects.filter(message_id=OuterRef("pk"), user=request.user)))
            .select_related("sender")
            .order_by("-created_at")
        )

        offset = (page - 1) * limit
        rows = list(messages_qs[offset : offset + limit + 1])
        has_next = len(rows) > limit
        page_items = rows[:limit]

        if page == 1 and not has_next:
            total_count = len(page_items)
            total_pages = 1
        else:
            total_count = messages_qs.count()
            total_pages = max(1, (total_count + limit - 1) // limit)

        # Only issue write UPDATE if unread_count is actually > 0
        ConversationMember.objects.filter(
            conversation=conversation, user=request.user, unread_count__gt=0
        ).update(unread_count=0)

        return Response({
            "success": True,
            "messages": MessageSerializer(page_items, many=True).data,
            "totalPages": total_pages,
            "currentPage": page,
            "totalMessages": total_count,
            "ephemeral_ttl": conversation.ephemeral_ttl,
        })


class EditMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, id):
        message = get_object_or_404(Message.objects.select_related("conversation"), id=id)
        if message.sender_id != request.user.id:
            return Response({"success": False, "message": "Only the author can edit this message."}, status=status.HTTP_403_FORBIDDEN)

        if message.is_deleted:
            return Response({"success": False, "message": "Cannot edit a deleted message."}, status=status.HTTP_400_BAD_REQUEST)

        if message.expires_at and timezone.now() > message.expires_at:
            return Response({"success": False, "message": "Cannot edit an expired message."}, status=status.HTTP_400_BAD_REQUEST)

        new_content = request.data.get("content", "").strip()
        if not new_content:
            return Response({"success": False, "message": "Content cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            MessageEdit.objects.create(message=message, old_content=message.decrypted_content)
            message.content = encrypt_message(new_content)
            message.is_edited = True
            message.save(update_fields=["content", "is_edited"])

            recipient_ids = get_conversation_recipient_ids(message.conversation, request.user.id)
            outbox_entry = OutboxService.create_outbox_event(
                event_type="message.updated",
                conversation_id=str(message.conversation_id),
                payload={
                    "event": "message.updated",
                    "conversation_id": str(message.conversation_id),
                    "message_id": str(message.id),
                    "content": new_content,
                    "isEdited": True,
                    "recipient_ids": recipient_ids,
                }
            )

        OutboxService.publish_item(outbox_entry)
        return Response({"success": True, "message": "Message edited.", "data": {"content": new_content, "isEdited": True}})


class DeleteMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, id):
        """Delete for everyone (soft delete tombstone)."""
        message = get_object_or_404(Message.objects.select_related("conversation"), id=id)
        is_admin = message.conversation.admins.filter(id=request.user.id).exists() or message.conversation.creator == request.user
        if message.sender_id != request.user.id and not is_admin:
            return Response({"success": False, "message": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        with transaction.atomic():
            message.is_deleted = True
            message.save(update_fields=["is_deleted"])

            recipient_ids = get_conversation_recipient_ids(message.conversation, request.user.id)
            outbox_entry = OutboxService.create_outbox_event(
                event_type="message.deleted",
                conversation_id=str(message.conversation_id),
                payload={
                    "event": "message.deleted",
                    "conversation_id": str(message.conversation_id),
                    "message_id": str(message.id),
                    "recipient_ids": recipient_ids,
                }
            )

        OutboxService.publish_item(outbox_entry)
        return Response({"success": True, "message": "Message deleted for everyone."})


class DeleteMessageForMeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        """Delete for me (hides message for current user only)."""
        message = get_object_or_404(Message.objects.select_related("conversation"), id=id)
        # IDOR protection: Verify membership in message's conversation
        if not message.conversation.member_records.filter(user=request.user).exists():
            return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        DeletedMessageForUser.objects.get_or_create(user=request.user, message=message)
        return Response({"success": True, "message": "Message deleted for you."})


class ReactMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        message = get_object_or_404(Message.objects.select_related("conversation"), id=id)
        # IDOR protection: Verify membership in message's conversation
        if not message.conversation.member_records.filter(user=request.user).exists():
            return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        reaction_emoji = (request.data.get("reaction") or request.data.get("emoji") or "").strip()
        if not reaction_emoji:
            return Response({"success": False, "message": "reaction emoji required."}, status=status.HTTP_400_BAD_REQUEST)

        # Toggle reaction if clicking the same emoji
        existing_rx = MessageReaction.objects.filter(message=message, user=request.user).first()
        if existing_rx and existing_rx.reaction == reaction_emoji:
            existing_rx.delete()
        else:
            MessageReaction.objects.update_or_create(
                message=message,
                user=request.user,
                defaults={"reaction": reaction_emoji}
            )

        all_rx = [
            {
                "user_id": str(r.user_id),
                "reaction": r.reaction,
                "emoji": r.reaction,
            }
            for r in message.reaction_records.all()
        ]
        message.reactions = all_rx
        message.save(update_fields=["reactions"])

        recipient_ids = get_conversation_recipient_ids(message.conversation, request.user.id)
        outbox_entry = OutboxService.create_outbox_event(
            event_type="message.reaction",
            conversation_id=str(message.conversation_id),
            payload={
                "event": "message.reaction",
                "legacy_event": "MESSAGE_REACTED",
                "conversation_id": str(message.conversation_id),
                "chatId": str(message.conversation_id),
                "message_id": str(message.id),
                "messageId": str(message.id),
                "user_id": str(request.user.id),
                "reaction": reaction_emoji,
                "emoji": reaction_emoji,
                "reactions": all_rx,
                "recipient_ids": recipient_ids,
            }
        )
        OutboxService.publish_item(outbox_entry)

        return Response({"success": True, "reactions": all_rx})


class ForwardMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        message_id = request.data.get("messageId")
        chat_ids = request.data.get("chatIds", [])
        original = get_object_or_404(Message.objects.select_related("conversation"), id=message_id)

        # IDOR protection: User must be a member of the original conversation!
        if not original.conversation.member_records.filter(user=request.user).exists():
            return Response({"success": False, "message": "Cannot forward a message from a conversation you are not a member of."}, status=status.HTTP_403_FORBIDDEN)

        forwarded_messages = []
        for cid in chat_ids:
            conv = Conversation.objects.filter(id=cid, member_records__user=request.user).first()
            if not conv:
                continue

            with transaction.atomic():
                new_msg = Message.objects.create(
                    conversation=conv,
                    sender=request.user,
                    message_type=original.message_type,
                    content=original.content,
                    attachments=original.attachments,
                    status="sent",
                )
                forwarded_messages.append(str(new_msg.id))

                recipient_ids = get_conversation_recipient_ids(conv, request.user.id)
                OutboxService.create_outbox_event(
                    event_type="message.created",
                    conversation_id=str(conv.id),
                    payload={
                        "event": "message.created",
                        "conversation_id": str(conv.id),
                        "message_id": str(new_msg.id),
                        "sender_id": str(request.user.id),
                        "sender_name": request.user.name or request.user.username,
                        "content": original.decrypted_content,
                        "attachments": original.attachments,
                        "timestamp": new_msg.created_at.isoformat(),
                        "recipient_ids": recipient_ids,
                    }
                )

        OutboxService.publish_pending()
        return Response({"success": True, "forwardedCount": len(forwarded_messages)})


class SearchMessagesView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [SearchThrottle]

    def get(self, request, chat_id):
        conversation = get_object_or_404(Conversation, id=chat_id)
        if not conversation.member_records.filter(user=request.user).exists():
            return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        query = request.query_params.get("q", "").strip().lower()
        now = timezone.now()

        # Exclude deleted messages and expired messages
        all_messages = Message.objects.filter(
            conversation=conversation,
            is_deleted=False
        ).filter(
            Q(expires_at__isnull=True) | Q(expires_at__gt=now)
        ).select_related("sender").order_by("-created_at")

        matched = []
        for m in all_messages:
            decrypted = m.decrypted_content.lower()
            if query in decrypted:
                matched.append(MessageSerializer(m).data)

        return Response({"success": True, "messages": matched[:50]})


class GetChatMediaView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, chat_id):
        conversation = get_object_or_404(Conversation, id=chat_id)
        if not conversation.member_records.filter(user=request.user).exists():
            return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        now = timezone.now()
        messages_with_media = Message.objects.filter(
            conversation=conversation,
            is_deleted=False
        ).filter(
            Q(expires_at__isnull=True) | Q(expires_at__gt=now)
        ).exclude(attachments=[]).order_by("-created_at")[:100]

        all_attachments = []
        for m in messages_with_media:
            for att in m.attachments:
                all_attachments.append({
                    "message_id": str(m.id),
                    "created_at": m.created_at.isoformat(),
                    **att
                })

        return Response({"success": True, "media": all_attachments})
