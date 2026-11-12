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

        topic_name = str(request.data.get("topic_name") or request.data.get("topicName") or "").strip().lstrip("#")[:64]
        raw_thread_root = request.data.get("thread_root_id") or request.data.get("threadRootId") or None
        thread_root_uuid = None
        if raw_thread_root:
            try:
                thread_root_uuid = uuid.UUID(str(raw_thread_root))
            except ValueError:
                thread_root_uuid = None
        view_once = str(request.data.get("view_once", "")).lower() in ("1", "true", "yes")

        with transaction.atomic():
            message = Message.objects.create(
                conversation=conversation,
                sender=request.user,
                client_message_id=client_msg_id,
                message_type=msg_type,
                content=content,
                attachments=attachments,
                reply_to=reply_to,
                topic_name=topic_name,
                thread_root_id=thread_root_uuid,
                view_once=view_once,
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

            # Increment unread count for recipients & restore any user who previously hid the DM
            ConversationMember.objects.filter(
                conversation=conversation, is_deleted_for_user=True
            ).update(is_deleted_for_user=False)
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
        from django.db.models import Count
        from .interactive import apply_seen_ephemeral_expiry, flush_due_scheduled_messages

        conversation = get_object_or_404(Conversation, id=id)
        member_rec = conversation.member_records.filter(user=request.user).first()
        if not member_rec:
            return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        flush_due_scheduled_messages(conversation_id=conversation.id)

        page = max(1, int(request.query_params.get("page", 1)))
        limit = max(1, min(int(request.query_params.get("limit", 25)), 100))
        topic = (request.query_params.get("topic") or "").strip().lstrip("#")
        now = timezone.now()

        # Exclude messages deleted for this user, cleared before user's cleared_at, expired messages, future scheduled, and thread replies
        messages_qs = (
            Message.objects.filter(conversation=conversation, delivery_pending=False, thread_root_id__isnull=True)
            .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
            .filter(~Exists(DeletedMessageForUser.objects.filter(message_id=OuterRef("pk"), user=request.user)))
            .select_related("sender")
            .order_by("-created_at")
        )
        if member_rec.cleared_at:
            messages_qs = messages_qs.filter(created_at__gt=member_rec.cleared_at)
        if topic and topic.lower() != "all":
            messages_qs = messages_qs.filter(topic_name=topic)

        offset = (page - 1) * limit
        rows = list(messages_qs[offset : offset + limit + 1])
        has_next = len(rows) > limit
        page_items = rows[:limit]
        if page == 1 and page_items:
            apply_seen_ephemeral_expiry(conversation, page_items, request.user.id)

        page_ids = [m.id for m in page_items]
        reply_counts = {}
        if page_ids:
            rc_rows = (
                Message.objects.filter(conversation=conversation, thread_root_id__in=page_ids, delivery_pending=False)
                .values("thread_root_id")
                .annotate(cnt=Count("id"))
            )
            reply_counts = {str(r["thread_root_id"]): r["cnt"] for r in rc_rows}

        if page == 1 and not has_next:
            total_count = len(page_items)
            total_pages = 1
        else:
            total_count = messages_qs.count()
            total_pages = max(1, (total_count + limit - 1) // limit)

        # Only issue write UPDATE if unread_count is actually > 0
        updated_unread = ConversationMember.objects.filter(
            conversation=conversation, user=request.user, unread_count__gt=0
        ).update(unread_count=0)
        if updated_unread:
            outbox_entry = OutboxService.create_outbox_event(
                event_type="message.read",
                conversation_id="",
                payload={
                    "event": "message.read",
                    "legacy_event": "MESSAGE_READ_UPDATE",
                    "chatId": str(conversation.id),
                    "conversation_id": str(conversation.id),
                    "messageIds": [],
                    "readBy": str(request.user.id),
                    "recipient_ids": [str(request.user.id)],
                },
            )
            OutboxService.publish_item(outbox_entry)

        return Response({
            "success": True,
            "messages": MessageSerializer(
                page_items, many=True, context={"request": request, "reply_counts": reply_counts}
            ).data,
            "totalPages": total_pages,
            "currentPage": page,
            "totalMessages": total_count,
            "ephemeral_ttl": conversation.ephemeral_ttl,
            "topics": conversation.topics or [],
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
                    "legacy_event": "MESSAGE_EDITED",
                    "conversation_id": str(message.conversation_id),
                    "chatId": str(message.conversation_id),
                    "message_id": str(message.id),
                    "messageId": str(message.id),
                    "content": new_content,
                    "isEdited": True,
                    "recipient_ids": recipient_ids,
                }
            )

        OutboxService.publish_item(outbox_entry)
        return Response({"success": True, "message": "Message edited.", "data": {"content": new_content, "isEdited": True}})

    def delete(self, request, id):
        return DeleteMessageView().delete(request, id)


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
                    "legacy_event": "MESSAGE_DELETED",
                    "conversation_id": str(message.conversation_id),
                    "chatId": str(message.conversation_id),
                    "message_id": str(message.id),
                    "messageId": str(message.id),
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
        # Sync "Delete for me" across all active devices logged in as this user
        outbox_entry = OutboxService.create_outbox_event(
            event_type="message.deleted_for_me",
            conversation_id="",
            payload={
                "event": "message.deleted_for_me",
                "conversation_id": str(message.conversation_id),
                "chatId": str(message.conversation_id),
                "message_id": str(message.id),
                "messageId": str(message.id),
                "recipient_ids": [str(request.user.id)],
            },
        )
        OutboxService.publish_item(outbox_entry)
        return Response({"success": True, "message": "Message deleted for you."})

    def delete(self, request, id):
        return self.post(request, id)


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
        from .interactive import fuzzy_match_score

        conversation = get_object_or_404(Conversation, id=chat_id)
        member_rec = conversation.member_records.filter(user=request.user).first()
        if not member_rec:
            return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        query = request.query_params.get("q", "").strip()
        sender_id_filter = request.query_params.get("senderId", "").strip()
        use_fuzzy = str(request.query_params.get("fuzzy", "true")).lower() != "false"
        page = max(1, int(request.query_params.get("page", 1)))
        limit = 20
        now = timezone.now()

        if not query and not sender_id_filter:
            return Response({"success": True, "messages": [], "totalPages": 0})

        all_messages = (
            Message.objects.filter(conversation=conversation, is_deleted=False, delivery_pending=False)
            .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
            .filter(~Exists(DeletedMessageForUser.objects.filter(message_id=OuterRef("pk"), user=request.user)))
            .select_related("sender")
            .order_by("-created_at")[:600]
        )
        if member_rec.cleared_at:
            all_messages = [m for m in all_messages if m.created_at > member_rec.cleared_at]

        scored = []
        threshold = 0.56 if use_fuzzy else 0.9
        for m in all_messages:
            if sender_id_filter and str(m.sender_id) != sender_id_filter:
                continue

            decrypted = m.decrypted_content or ""
            att_text = " ".join(
                str(a.get("name") or a.get("question") or "")
                for a in (m.attachments or [])
                if isinstance(a, dict)
            )
            sender_text = f"{m.sender.name or ''} {m.sender.username or ''}".strip()
            searchable = f"{decrypted} {att_text}".strip()

            if not query:
                score = 1.0
            else:
                text_score = fuzzy_match_score(query, searchable)
                sender_score = fuzzy_match_score(query, sender_text) * 0.85
                score = max(text_score, sender_score)

            if score >= threshold:
                item = MessageSerializer(m, context={"request": request}).data
                item["matchScore"] = int(round(score * 100))
                scored.append((score, m.created_at, item))

        scored.sort(key=lambda tup: (tup[0], tup[1]), reverse=True)
        total = len(scored)
        total_pages = max(1, (total + limit - 1) // limit) if total else 0
        start = (page - 1) * limit
        page_items = [tup[2] for tup in scored[start : start + limit]]

        return Response({
            "success": True,
            "messages": page_items,
            "totalPages": total_pages,
            "totalMatches": total,
        })


class GetChatMediaView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, chat_id):
        conversation = get_object_or_404(Conversation, id=chat_id)
        member_rec = conversation.member_records.filter(user=request.user).first()
        if not member_rec:
            return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        now = timezone.now()
        qs = (
            Message.objects.filter(conversation=conversation, is_deleted=False, delivery_pending=False)
            .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
            .filter(~Exists(DeletedMessageForUser.objects.filter(message_id=OuterRef("pk"), user=request.user)))
            .exclude(attachments=[])
        )
        if member_rec.cleared_at:
            qs = qs.filter(created_at__gt=member_rec.cleared_at)
        messages_with_media = qs.order_by("-created_at")[:100]

        all_attachments = []
        for m in messages_with_media:
            for att in m.attachments:
                all_attachments.append({
                    "message_id": str(m.id),
                    "created_at": m.created_at.isoformat(),
                    **att
                })

        return Response({"success": True, "media": all_attachments})


class CreatePollView(APIView):
    """Creates an interactive poll message inside a conversation and broadcasts it via Outbox/WS."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        chat_id = request.data.get("chatId") or request.data.get("conversation_id")
        question = str(request.data.get("question", "")).strip()
        raw_options = request.data.get("options", [])
        allow_multiple = bool(request.data.get("allowMultiple", False))

        if not chat_id or not question or not isinstance(raw_options, list):
            return Response({"success": False, "message": "chatId, question, and options are required."}, status=status.HTTP_400_BAD_REQUEST)

        clean_options = [str(o).strip()[:120] for o in raw_options if str(o).strip()]
        if len(clean_options) < 2 or len(clean_options) > 8:
            return Response({"success": False, "message": "Polls require between 2 and 8 non-empty options."}, status=status.HTTP_400_BAD_REQUEST)

        conversation = get_object_or_404(Conversation, id=chat_id)
        if not conversation.member_records.filter(user=request.user).exists():
            return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        if conversation.restricted_messages and not (conversation.admins.filter(id=request.user.id).exists() or conversation.creator == request.user):
            return Response({"success": False, "message": "Only admins may post polls in this restricted group."}, status=status.HTTP_403_FORBIDDEN)

        poll_payload = {
            "type": "poll",
            "question": question[:240],
            "allowMultiple": allow_multiple,
            "options": [
                {"id": str(idx + 1), "text": opt, "votes": []}
                for idx, opt in enumerate(clean_options)
            ],
        }
        expires_at = timezone.now() + timedelta(seconds=conversation.ephemeral_ttl) if conversation.ephemeral_ttl else None

        with transaction.atomic():
            msg = Message.objects.create(
                conversation=conversation,
                sender=request.user,
                message_type="poll",
                content=f"📊 Poll: {poll_payload['question']}",
                attachments=[poll_payload],
                status="sent",
                expires_at=expires_at,
            )
            conversation.updated_at = timezone.now()
            conversation.save(update_fields=["updated_at"])
            ConversationMember.objects.filter(conversation=conversation).exclude(user=request.user).update(
                unread_count=models.F("unread_count") + 1
            )
            serialized_msg = MessageSerializer(msg).data
            recipient_ids = get_conversation_recipient_ids(conversation, request.user.id)
            outbox_entry = OutboxService.create_outbox_event(
                event_type="message.created",
                conversation_id=str(conversation.id),
                payload={
                    "event": "message.created",
                    "legacy_event": "NEW_MESSAGE",
                    "chatId": str(conversation.id),
                    "conversation_id": str(conversation.id),
                    "message_id": str(msg.id),
                    "sender_id": str(request.user.id),
                    "sender_name": request.user.name or request.user.username,
                    "content": serialized_msg["content"],
                    "attachments": [poll_payload],
                    "recipient_ids": recipient_ids,
                    "message": serialized_msg,
                },
            )
        OutboxService.publish_item(outbox_entry)
        return Response({"success": True, "message": serialized_msg}, status=status.HTTP_201_CREATED)


class VotePollView(APIView):
    """Toggles the authenticated conversation member's vote on a poll option."""
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        option_id = str(request.data.get("optionId", "")).strip()
        if not option_id:
            return Response({"success": False, "message": "optionId is required."}, status=status.HTTP_400_BAD_REQUEST)

        uid = str(request.user.id)
        with transaction.atomic():
            msg = get_object_or_404(Message.objects.select_for_update().select_related("conversation"), id=id)
            if not msg.conversation.member_records.filter(user=request.user).exists():
                return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

            attachments = list(msg.attachments or [])
            poll_idx = next((i for i, a in enumerate(attachments) if isinstance(a, dict) and a.get("type") == "poll"), -1)
            if poll_idx < 0:
                return Response({"success": False, "message": "Message does not contain a poll."}, status=status.HTTP_400_BAD_REQUEST)

            poll = dict(attachments[poll_idx])
            options = [dict(o) for o in poll.get("options", [])]
            target_opt = next((o for o in options if str(o.get("id")) == option_id), None)
            if not target_opt:
                return Response({"success": False, "message": "Invalid poll option."}, status=status.HTTP_400_BAD_REQUEST)

            allow_multiple = bool(poll.get("allowMultiple", False))
            already_voted = uid in (target_opt.get("votes") or [])
            for opt in options:
                votes = [str(v) for v in (opt.get("votes") or []) if str(v) != uid]
                if str(opt.get("id")) == option_id and not already_voted:
                    votes.append(uid)
                elif not allow_multiple and str(opt.get("id")) != option_id:
                    pass
                elif allow_multiple and str(opt.get("id")) != option_id:
                    votes = list(opt.get("votes") or [])
                opt["votes"] = votes

            poll["options"] = options
            attachments[poll_idx] = poll
            msg.attachments = attachments
            msg.save(update_fields=["attachments"])

            recipient_ids = get_conversation_recipient_ids(msg.conversation, request.user.id)
            outbox_entry = OutboxService.create_outbox_event(
                event_type="message.poll_updated",
                conversation_id=str(msg.conversation_id),
                payload={
                    "event": "message.poll_updated",
                    "legacy_event": "MESSAGE_POLL_UPDATED",
                    "chatId": str(msg.conversation_id),
                    "conversation_id": str(msg.conversation_id),
                    "message_id": str(msg.id),
                    "messageId": str(msg.id),
                    "attachments": attachments,
                    "recipient_ids": recipient_ids,
                },
            )
        OutboxService.publish_item(outbox_entry)
        return Response({"success": True, "attachments": attachments})


class MessageReceiptsView(APIView):
    """Returns per-member read receipts & timestamps for a message (Seen By sheet)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        from apps.authentication.models import User as AuthUser

        msg = get_object_or_404(Message.objects.select_related("conversation"), id=id)
        if not msg.conversation.member_records.filter(user=request.user).exists():
            return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        receipts_qs = MessageReceipt.objects.filter(message=msg, status="read").select_related("user").order_by("timestamp")
        receipts_by_uid = {}
        for r in receipts_qs:
            u = r.user
            receipts_by_uid[str(u.id)] = {
                "_id": str(u.id),
                "name": u.name or u.username,
                "username": u.username,
                "avatar": u.avatar.get("url") if isinstance(u.avatar, dict) else None,
                "readAt": r.timestamp.isoformat() if r.timestamp else None,
            }

        missing_uids = [str(uid) for uid in (msg.read_by or []) if str(uid) not in receipts_by_uid and str(uid) != str(msg.sender_id)]
        if missing_uids:
            for u in AuthUser.objects.filter(id__in=missing_uids):
                receipts_by_uid[str(u.id)] = {
                    "_id": str(u.id),
                    "name": u.name or u.username,
                    "username": u.username,
                    "avatar": u.avatar.get("url") if isinstance(u.avatar, dict) else None,
                    "readAt": None,
                }

        receipts_by_uid.pop(str(msg.sender_id), None)
        return Response({"success": True, "receipts": list(receipts_by_uid.values())})


def _publish_interactive_message(conversation, sender, msg_type: str, content: str, attachment: dict, topic_name: str = ""):
    expires_at = timezone.now() + timedelta(seconds=conversation.ephemeral_ttl) if conversation.ephemeral_ttl else None
    with transaction.atomic():
        msg = Message.objects.create(
            conversation=conversation,
            sender=sender,
            message_type=msg_type,
            content=content,
            attachments=[attachment],
            topic_name=topic_name,
            status="sent",
            expires_at=expires_at,
        )
        conversation.updated_at = timezone.now()
        conversation.save(update_fields=["updated_at"])
        ConversationMember.objects.filter(conversation=conversation).exclude(user=sender).update(
            unread_count=models.F("unread_count") + 1
        )
        serialized_msg = MessageSerializer(msg).data
        recipient_ids = get_conversation_recipient_ids(conversation, sender.id)
        outbox_entry = OutboxService.create_outbox_event(
            event_type="message.created",
            conversation_id=str(conversation.id),
            payload={
                "event": "message.created",
                "legacy_event": "NEW_MESSAGE",
                "chatId": str(conversation.id),
                "conversation_id": str(conversation.id),
                "message_id": str(msg.id),
                "sender_id": str(sender.id),
                "sender_name": sender.name or sender.username,
                "content": content,
                "attachments": [attachment],
                "recipient_ids": recipient_ids,
                "message": serialized_msg,
            },
        )
    OutboxService.publish_item(outbox_entry)
    return serialized_msg


def _broadcast_interactive_update(msg, recipient_ids):
    outbox_entry = OutboxService.create_outbox_event(
        event_type="message.interactive_updated",
        conversation_id=str(msg.conversation_id),
        payload={
            "event": "message.interactive_updated",
            "legacy_event": "MESSAGE_INTERACTIVE_UPDATED",
            "chatId": str(msg.conversation_id),
            "conversation_id": str(msg.conversation_id),
            "message_id": str(msg.id),
            "messageId": str(msg.id),
            "attachments": msg.attachments or [],
            "viewedBy": msg.viewed_by or [],
            "recipient_ids": recipient_ids,
        },
    )
    OutboxService.publish_item(outbox_entry)


class MessageThreadView(APIView):
    """Returns a parent message and all Slack-style side thread replies."""
    permission_classes = [IsAuthenticated]

    def get(self, request, root_id):
        root = get_object_or_404(Message.objects.select_related("conversation", "sender"), id=root_id)
        if not root.conversation.member_records.filter(user=request.user).exists():
            return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        replies = (
            Message.objects.filter(conversation=root.conversation, thread_root_id=root.id, delivery_pending=False)
            .filter(~Exists(DeletedMessageForUser.objects.filter(message_id=OuterRef("pk"), user=request.user)))
            .select_related("sender")
            .order_by("created_at")
        )
        return Response({
            "success": True,
            "root": MessageSerializer(root, context={"request": request}).data,
            "replies": MessageSerializer(replies, many=True, context={"request": request}).data,
        })


class ConsumeViewOnceView(APIView):
    """Unlocks a view-once photo/video/voice note exactly once per recipient."""
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        uid = str(request.user.id)
        with transaction.atomic():
            msg = get_object_or_404(Message.objects.select_for_update().select_related("conversation"), id=id)
            if not msg.conversation.member_records.filter(user=request.user).exists():
                return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
            if not msg.view_once:
                return Response({"success": True, "attachments": msg.attachments or []})

            if uid == str(msg.sender_id):
                return Response({"success": True, "attachments": msg.attachments or [], "isSender": True})

            viewed = [str(v) for v in (msg.viewed_by or [])]
            if uid in viewed:
                return Response({"success": False, "message": "This view-once media has already been opened."}, status=status.HTTP_410_GONE)

            attachments_payload = list(msg.attachments or [])
            viewed.append(uid)
            msg.viewed_by = viewed
            msg.save(update_fields=["viewed_by"])
            recipient_ids = get_conversation_recipient_ids(msg.conversation, request.user.id)

        _broadcast_interactive_update(msg, recipient_ids)
        return Response({"success": True, "attachments": attachments_payload, "viewedBy": viewed})


class ScheduleMessageView(APIView):
    """Schedules a future message or reminder (/remind) for a conversation."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from datetime import datetime as dt_cls

        chat_id = request.data.get("chatId") or request.data.get("conversation_id")
        content = (request.data.get("content") or "").strip()
        scheduled_raw = (request.data.get("scheduledFor") or request.data.get("scheduled_for") or "").strip()
        topic_name = str(request.data.get("topicName") or "").strip().lstrip("#")[:64]

        if not chat_id or not content or not scheduled_raw:
            return Response({"success": False, "message": "chatId, content, and scheduledFor are required."}, status=status.HTTP_400_BAD_REQUEST)

        conversation = get_object_or_404(Conversation, id=chat_id)
        if not conversation.member_records.filter(user=request.user).exists():
            return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        try:
            sched_dt = dt_cls.fromisoformat(scheduled_raw.replace("Z", "+00:00"))
            if timezone.is_naive(sched_dt):
                sched_dt = timezone.make_aware(sched_dt)
        except ValueError:
            return Response({"success": False, "message": "Invalid ISO timestamp for scheduledFor."}, status=status.HTTP_400_BAD_REQUEST)

        if sched_dt <= timezone.now() + timedelta(seconds=5):
            sched_dt = timezone.now() + timedelta(seconds=5)

        msg = Message.objects.create(
            conversation=conversation,
            sender=request.user,
            message_type="text",
            content=content,
            topic_name=topic_name,
            scheduled_for=sched_dt,
            delivery_pending=True,
            status="pending",
        )
        return Response({
            "success": True,
            "scheduled": MessageSerializer(msg, context={"request": request}).data,
        }, status=status.HTTP_201_CREATED)


class ListScheduledMessagesView(APIView):
    """Lists pending scheduled messages/reminders for the current user in a chat and flushes due ones."""
    permission_classes = [IsAuthenticated]

    def get(self, request, chat_id):
        from .interactive import flush_due_scheduled_messages

        conversation = get_object_or_404(Conversation, id=chat_id)
        if not conversation.member_records.filter(user=request.user).exists():
            return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        delivered_count = flush_due_scheduled_messages(conversation_id=conversation.id)
        pending = (
            Message.objects.filter(conversation=conversation, sender=request.user, delivery_pending=True)
            .select_related("sender")
            .order_by("scheduled_for")
        )
        return Response({
            "success": True,
            "deliveredCount": delivered_count,
            "scheduled": MessageSerializer(pending, many=True, context={"request": request}).data,
        })

    def delete(self, request, chat_id):
        msg = get_object_or_404(Message, id=chat_id, sender=request.user, delivery_pending=True)
        msg.delete()
        return Response({"success": True, "message": "Scheduled message cancelled."})


class CreateGameView(APIView):
    """Starts an interactive multiplayer mini-game inside a conversation."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from .interactive import create_initial_game_state

        chat_id = request.data.get("chatId") or request.data.get("conversation_id")
        game_type = (request.data.get("gameType") or "tictactoe").strip().lower()
        topic_name = str(request.data.get("topicName") or "").strip().lstrip("#")[:64]

        conversation = get_object_or_404(Conversation, id=chat_id)
        if not conversation.member_records.filter(user=request.user).exists():
            return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        options = {
            "customWord": request.data.get("customWord") or "",
            "category": request.data.get("category") or "",
            "categoryName": request.data.get("categoryName") or "",
            "difficulty": request.data.get("difficulty") or "",
            "customQuiz": request.data.get("customQuiz"),
        }
        try:
            game_state = create_initial_game_state(game_type, request.user, options=options)
        except ValueError as err:
            return Response({"success": False, "message": str(err)}, status=status.HTTP_400_BAD_REQUEST)

        labels = {
            "tictactoe": "Tic-Tac-Toe",
            "rps": "Rock Paper Scissors",
            "connect4": "Connect 4",
            "trivia": "Quiz Battle",
            "quiz": "Quiz Battle",
            "wordguess": "Word Guess",
            "diceduel": "Dice Duel",
            "coinflip": "Coin Flip",
            "highlow": "High-Low Guess",
            "memory": "Memory Match",
            "dotsboxes": "Dots & Boxes",
            "reversi": "Mini Reversi",
            "mines": "Minesweeper",
            "blackjack": "21 Blackjack",
            "evenodd": "Even / Odd Bet",
            "oddone": "Emoji Odd-One-Out",
            "mathsprint": "Math Sprint",
        }
        serialized = _publish_interactive_message(
            conversation,
            request.user,
            "game",
            f"🎮 {request.user.name or request.user.username} started {labels.get(game_type, 'Mini-Game')}!",
            game_state,
            topic_name=topic_name,
        )
        return Response({"success": True, "message": serialized}, status=status.HTTP_201_CREATED)


class MoveGameView(APIView):
    """Applies a player move in an in-chat mini-game and broadcasts updated board to all members."""
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        from .interactive import apply_game_move

        with transaction.atomic():
            msg = get_object_or_404(Message.objects.select_for_update().select_related("conversation"), id=id)
            if not msg.conversation.member_records.filter(user=request.user).exists():
                return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

            attachments = list(msg.attachments or [])
            idx = next((i for i, a in enumerate(attachments) if isinstance(a, dict) and a.get("type") == "game"), -1)
            if idx < 0:
                return Response({"success": False, "message": "Game not found on message."}, status=status.HTTP_400_BAD_REQUEST)

            next_game, err = apply_game_move(attachments[idx], request.user, request.data)
            if err:
                return Response({"success": False, "message": err}, status=status.HTTP_400_BAD_REQUEST)

            attachments[idx] = next_game
            msg.attachments = attachments
            msg.save(update_fields=["attachments"])
            recipient_ids = get_conversation_recipient_ids(msg.conversation, request.user.id)

        _broadcast_interactive_update(msg, recipient_ids)
        return Response({"success": True, "attachments": attachments})


class LiveLocationShareView(APIView):
    """Creates a live location sharing card inside a chat (15m / 60m ETA)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        chat_id = request.data.get("chatId") or request.data.get("conversation_id")
        lat = request.data.get("lat")
        lng = request.data.get("lng")
        duration_minutes = max(5, min(int(request.data.get("durationMinutes", 15)), 180))
        label = (request.data.get("label") or "").strip()[:100]
        topic_name = str(request.data.get("topicName") or "").strip().lstrip("#")[:64]

        if not chat_id or lat is None or lng is None:
            return Response({"success": False, "message": "chatId, lat, and lng are required."}, status=status.HTTP_400_BAD_REQUEST)

        conversation = get_object_or_404(Conversation, id=chat_id)
        if not conversation.member_records.filter(user=request.user).exists():
            return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        expires_at = (timezone.now() + timedelta(minutes=duration_minutes)).isoformat()
        loc_att = {
            "type": "location",
            "lat": float(lat),
            "lng": float(lng),
            "label": label or "Live Location",
            "durationMinutes": duration_minutes,
            "expiresAt": expires_at,
            "active": True,
            "senderName": request.user.name or request.user.username,
            "updatedAt": timezone.now().isoformat(),
        }
        serialized = _publish_interactive_message(
            conversation,
            request.user,
            "location",
            f"📍 Sharing live location ({duration_minutes} min)",
            loc_att,
            topic_name=topic_name,
        )
        return Response({"success": True, "message": serialized}, status=status.HTTP_201_CREATED)


class LiveLocationUpdateView(APIView):
    """Updates or stops an active shared live location card."""
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        with transaction.atomic():
            msg = get_object_or_404(Message.objects.select_for_update().select_related("conversation"), id=id)
            if msg.sender_id != request.user.id:
                return Response({"success": False, "message": "Only sender can update live location."}, status=status.HTTP_403_FORBIDDEN)

            attachments = list(msg.attachments or [])
            idx = next((i for i, a in enumerate(attachments) if isinstance(a, dict) and a.get("type") == "location"), -1)
            if idx < 0:
                return Response({"success": False, "message": "Location attachment not found."}, status=status.HTTP_400_BAD_REQUEST)

            loc = dict(attachments[idx])
            if request.data.get("stop") is True or request.data.get("active") is False:
                loc["active"] = False
            if request.data.get("lat") is not None and request.data.get("lng") is not None:
                loc["lat"] = float(request.data["lat"])
                loc["lng"] = float(request.data["lng"])
            loc["updatedAt"] = timezone.now().isoformat()
            attachments[idx] = loc
            msg.attachments = attachments
            msg.save(update_fields=["attachments"])
            recipient_ids = get_conversation_recipient_ids(msg.conversation, request.user.id)

        _broadcast_interactive_update(msg, recipient_ids)
        return Response({"success": True, "attachments": attachments})

