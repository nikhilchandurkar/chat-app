import json
import logging
import time
from datetime import timedelta
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone
from django.core.cache import cache

from apps.authentication.models import User, UserProfile, BlockedUser
from apps.chat.models import Conversation, ConversationMember
from apps.messages_app.models import Message, MessageReceipt, MessageReaction, encrypt_message
from apps.outbox.services.outbox_service import OutboxService

logger = logging.getLogger(__name__)

MAX_PAYLOAD_BYTES = 65536  # 64 KB limit
MAX_EVENTS_PER_MINUTE = 60


@database_sync_to_async
def get_user_privacy_profile(user):
    try:
        profile, _ = UserProfile.objects.get_or_create(user=user)
        return {
            "privacy_online": profile.privacy_online,
            "privacy_last_seen": profile.privacy_last_seen,
            "privacy_read_receipts": profile.privacy_read_receipts,
            "privacy_typing_indicator": profile.privacy_typing_indicator,
        }
    except Exception:
        return {
            "privacy_online": "everyone",
            "privacy_last_seen": "everyone",
            "privacy_read_receipts": True,
            "privacy_typing_indicator": True,
        }


@database_sync_to_async
def set_user_online_status(user, is_online: bool):
    try:
        user_record = User.objects.filter(id=user.id).first()
        if user_record:
            user_record.status = "online" if is_online else "offline"
            user_record.save(update_fields=["status"])
            profile, _ = UserProfile.objects.get_or_create(user=user_record)
            profile.online_status = user_record.status
            if not is_online:
                profile.last_seen = timezone.now()
            profile.save(update_fields=["online_status", "last_seen"])
    except Exception as e:
        logger.error("Error setting presence: %s", str(e))


@database_sync_to_async
def get_user_conversation_ids(user):
    return list(ConversationMember.objects.filter(user=user).values_list("conversation_id", flat=True))


@database_sync_to_async
def verify_conversation_membership(user, conversation_id):
    if not conversation_id:
        return False
    return ConversationMember.objects.filter(user=user, conversation_id=conversation_id).exists()


@database_sync_to_async
def check_user_blocked(user, conversation_id):
    """Verifies that in a direct conversation, neither party blocked the other."""
    try:
        conv = Conversation.objects.filter(id=conversation_id).first()
        if not conv or conv.group_chat:
            return False
        other_mem = conv.member_records.exclude(user=user).first()
        if not other_mem:
            return False
        other = other_mem.user
        return BlockedUser.objects.filter(user=user, blocked_user=other).exists() or BlockedUser.objects.filter(user=other, blocked_user=user).exists()
    except Exception:
        return False


@database_sync_to_async
def save_incoming_message(sender, chat_id, content, client_msg_id="", reply_to=None, attachments=None, msg_type="text"):
    try:
        conv = Conversation.objects.filter(id=chat_id).first()
        if not conv:
            return None, "Conversation not found"
        if not conv.member_records.filter(user=sender).exists():
            return None, "Not a member of this conversation"

        if conv.restricted_messages and not (conv.admins.filter(id=sender.id).exists() or conv.creator_id == sender.id):
            return None, "Only admins may post messages in this restricted group."

        # User blocking check
        if not conv.group_chat:
            other_mem = conv.member_records.exclude(user=sender).first()
            if other_mem:
                if BlockedUser.objects.filter(user=other_mem.user, blocked_user=sender).exists() or BlockedUser.objects.filter(user=sender, blocked_user=other_mem.user).exists():
                    return None, "Unable to send message due to block status."

        # Idempotency check
        if client_msg_id:
            existing = Message.objects.filter(client_message_id=client_msg_id, sender=sender).first()
            if existing:
                return {
                    "_id": str(existing.id),
                    "id": str(existing.id),
                    "content": existing.decrypted_content,
                    "sender": {
                        "_id": str(sender.id),
                        "id": str(sender.id),
                        "name": sender.name,
                        "avatar": sender.avatar.get("url") if isinstance(sender.avatar, dict) else None,
                    },
                    "chat": str(conv.id),
                    "conversation_id": str(conv.id),
                    "client_message_id": client_msg_id,
                    "attachments": existing.attachments,
                    "isEdited": existing.is_edited,
                    "isDeleted": existing.is_deleted,
                    "reactions": existing.reactions,
                    "replyTo": existing.reply_to,
                    "readBy": existing.read_by,
                    "createdAt": existing.created_at.isoformat(),
                    "expiresAt": existing.expires_at.isoformat() if existing.expires_at else None,
                }, None

        # Ephemeral TTL
        expires_at = None
        if conv.ephemeral_ttl and conv.ephemeral_ttl > 0:
            expires_at = timezone.now() + timedelta(seconds=conv.ephemeral_ttl)

        msg = Message.objects.create(
            conversation=conv,
            sender=sender,
            client_message_id=client_msg_id or "",
            message_type=msg_type,
            content=content,
            attachments=attachments or [],
            reply_to=reply_to,
            status="sent",
            expires_at=expires_at,
        )

        conv.updated_at = timezone.now()
        conv.save(update_fields=["updated_at"])

        recipient_ids = [str(m.user_id) for m in conv.member_records.all()]

        # Record in transactional outbox
        OutboxService.create_outbox_event(
            event_type="message.created",
            conversation_id=str(conv.id),
            payload={
                "event": "message.created",
                "conversation_id": str(conv.id),
                "message_id": str(msg.id),
                "sender_id": str(sender.id),
                "sender_name": sender.name or sender.username,
                "client_message_id": client_msg_id,
                "content": content,
                "attachments": attachments or [],
                "reply_to": reply_to,
                "timestamp": msg.created_at.isoformat(),
                "expires_at": expires_at.isoformat() if expires_at else None,
                "recipient_ids": recipient_ids,
            }
        )
        OutboxService.publish_pending()

        return {
            "_id": str(msg.id),
            "id": str(msg.id),
            "content": content,
            "sender": {
                "_id": str(sender.id),
                "id": str(sender.id),
                "name": sender.name,
                "avatar": sender.avatar.get("url") if isinstance(sender.avatar, dict) else None,
            },
            "chat": str(conv.id),
            "conversation_id": str(conv.id),
            "client_message_id": client_msg_id,
            "attachments": attachments or [],
            "isEdited": False,
            "isDeleted": False,
            "reactions": [],
            "replyTo": reply_to,
            "readBy": [str(sender.id)],
            "createdAt": msg.created_at.isoformat(),
            "expiresAt": expires_at.isoformat() if expires_at else None,
            "recipient_ids": recipient_ids,
        }, None
    except Exception as e:
        logger.error("Error saving incoming message: %s", str(e))
        return None, str(e)


@database_sync_to_async
def record_read_receipt(user, message_ids, chat_id):
    try:
        user_id_str = str(user.id)
        messages = Message.objects.filter(id__in=message_ids, conversation_id=chat_id)
        for m in messages:
            read_list = list(m.read_by or [])
            if user_id_str not in read_list:
                read_list.append(user_id_str)
                m.read_by = read_list
                m.save(update_fields=["read_by"])
            MessageReceipt.objects.get_or_create(message=m, user=user, status="read")

        ConversationMember.objects.filter(conversation_id=chat_id, user=user).update(unread_count=0)
        return True
    except Exception as e:
        logger.error("Error marking messages read: %s", str(e))
        return False


class ChatConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user = self.scope.get("user")
        if not self.user or not self.user.is_authenticated:
            await self.close(code=4001)
            return

        self.event_timestamps = []
        self.user_group = f"user_{self.user.id}"

        await self.channel_layer.group_add(self.user_group, self.channel_name)

        # Join conversation-specific groups for member's conversations only
        self.conv_ids = await get_user_conversation_ids(self.user)
        for cid in self.conv_ids:
            await self.channel_layer.group_add(f"chat_{cid}", self.channel_name)

        # Update presence in database
        await set_user_online_status(self.user, True)

        # Fetch privacy preferences
        privacy = await get_user_privacy_profile(self.user)
        self.privacy = privacy

        await self.accept()

        # Send connection established ack
        await self.send_json({
            "event": "connection.ready",
            "user_id": str(self.user.id),
            "timestamp": timezone.now().isoformat(),
        })

        # Broadcast online presence ONLY if user's privacy setting allows it
        if privacy.get("privacy_online") != "nobody":
            for cid in self.conv_ids:
                await self.channel_layer.group_send(
                    f"chat_{cid}",
                    {
                        "type": "chat.event",
                        "event": "user.online",
                        "event_legacy": "ONLINE_USERS",
                        "data": {"user_id": str(self.user.id), "status": "online"},
                    }
                )

    async def disconnect(self, close_code):
        if hasattr(self, "user") and self.user.is_authenticated:
            await self.channel_layer.group_discard(self.user_group, self.channel_name)
            if hasattr(self, "conv_ids"):
                for cid in self.conv_ids:
                    await self.channel_layer.group_discard(f"chat_{cid}", self.channel_name)

            await set_user_online_status(self.user, False)

            # Broadcast offline presence to user's conversation rooms if permitted
            if getattr(self, "privacy", {}).get("privacy_online") != "nobody" and hasattr(self, "conv_ids"):
                for cid in self.conv_ids:
                    await self.channel_layer.group_send(
                        f"chat_{cid}",
                        {
                            "type": "chat.event",
                            "event": "user.offline",
                            "event_legacy": "ONLINE_USERS",
                            "data": {"user_id": str(self.user.id), "status": "offline"},
                        }
                    )

    async def receive_json(self, content):
        # 1. Rate Limiting per WebSocket connection
        now = time.time()
        self.event_timestamps = [t for t in self.event_timestamps if now - t < 60]
        if len(self.event_timestamps) >= MAX_EVENTS_PER_MINUTE:
            await self.send_json({"event": "error", "message": "Rate limit exceeded on WebSocket events. Please slow down."})
            return
        self.event_timestamps.append(now)

        event = content.get("event") or content.get("type")
        data = content.get("data", content)

        # 2. Ping / Pong Heartbeats
        if event in ("ping", "heartbeat"):
            await self.send_json({"event": "pong", "timestamp": timezone.now().isoformat()})
            return

        # 3. Sending New Message
        elif event in ("message.create", "NEW_MESSAGE"):
            chat_id = data.get("chatId") or data.get("conversation_id")
            message_text = data.get("message") or data.get("content", "")
            client_msg_id = data.get("client_message_id", "")
            reply_to = data.get("replyTo") or data.get("reply_to")
            attachments = data.get("attachments", [])
            msg_type = data.get("message_type", "text")

            # Authorization Check
            is_member = await verify_conversation_membership(self.user, chat_id)
            if not is_member:
                await self.send_json({"event": "error", "message": "Access denied. You are not a member of this conversation."})
                return

            saved_data, err = await save_incoming_message(
                self.user, chat_id, message_text,
                client_msg_id=client_msg_id,
                reply_to=reply_to,
                attachments=attachments,
                msg_type=msg_type
            )

            if saved_data:
                await self.send_json({
                    "event": "message.ack",
                    "client_message_id": client_msg_id,
                    "message_id": saved_data["_id"],
                    "timestamp": saved_data["createdAt"],
                })

                recipients = saved_data.get("recipient_ids", [])
                for uid in recipients:
                    await self.channel_layer.group_send(
                        f"user_{uid}",
                        {
                            "type": "chat.event",
                            "event": "message.created",
                            "event_legacy": "NEW_MESSAGE",
                            "data": {
                                "chatId": chat_id,
                                "conversation_id": chat_id,
                                "message": saved_data,
                            }
                        }
                    )
            else:
                await self.send_json({
                    "event": "error",
                    "client_message_id": client_msg_id,
                    "message": err or "Failed to send message.",
                })

        # 4. Typing Indicators
        elif event in ("typing.start", "START_TYPING"):
            chat_id = data.get("chatId") or data.get("conversation_id")
            # Strict Authorization: User MUST be a conversation member
            is_member = await verify_conversation_membership(self.user, chat_id)
            if is_member and getattr(self, "privacy", {}).get("privacy_typing_indicator", True):
                await self.channel_layer.group_send(
                    f"chat_{chat_id}",
                    {
                        "type": "chat.event",
                        "event": "typing.started",
                        "event_legacy": "START_TYPING",
                        "data": {
                            "chatId": chat_id,
                            "userId": str(self.user.id),
                            "sender_name": self.user.name or self.user.username,
                        }
                    }
                )

        elif event in ("typing.stop", "STOP_TYPING"):
            chat_id = data.get("chatId") or data.get("conversation_id")
            # Strict Authorization: User MUST be a conversation member
            is_member = await verify_conversation_membership(self.user, chat_id)
            if is_member:
                await self.channel_layer.group_send(
                    f"chat_{chat_id}",
                    {
                        "type": "chat.event",
                        "event": "typing.stopped",
                        "event_legacy": "STOP_TYPING",
                        "data": {"chatId": chat_id, "userId": str(self.user.id)}
                    }
                )

        # 5. Read Receipts
        elif event in ("message.read", "MESSAGE_READ"):
            chat_id = data.get("chatId") or data.get("conversation_id")
            # Strict Authorization: User MUST be a conversation member
            is_member = await verify_conversation_membership(self.user, chat_id)
            if not is_member:
                return

            message_ids = data.get("messageIds") or [data.get("message_id")]
            message_ids = [m for m in message_ids if m]

            # Privacy setting check: Only emit if privacy_read_receipts is enabled
            if getattr(self, "privacy", {}).get("privacy_read_receipts", True):
                await record_read_receipt(self.user, message_ids, chat_id)
                await self.channel_layer.group_send(
                    f"chat_{chat_id}",
                    {
                        "type": "chat.event",
                        "event": "message.read",
                        "event_legacy": "MESSAGE_READ_UPDATE",
                        "data": {
                            "chatId": chat_id,
                            "messageIds": message_ids,
                            "readBy": str(self.user.id),
                        }
                    }
                )

    async def chat_event(self, event):
        """Handler for events dispatched to groups via channel_layer.group_send."""
        event_name = event.get("event")
        legacy_name = event.get("event_legacy")
        payload = event.get("data")

        await self.send_json({
            "event": event_name,
            "data": payload,
            "legacy_event": legacy_name,
        })
