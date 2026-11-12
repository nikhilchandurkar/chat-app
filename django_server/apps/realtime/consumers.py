import asyncio
import json
import logging
import time
from datetime import timedelta
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import DatabaseSyncToAsync
from django.db.models import Q
from django.utils import timezone

from apps.authentication.models import User, UserProfile, BlockedUser
from apps.chat.models import Conversation, ConversationMember
from apps.messages_app.models import Message, MessageReceipt, MessageReaction, encrypt_message
from apps.outbox.services.outbox_service import OutboxService
from apps.outbox.services.redis_streams import get_redis_client

logger = logging.getLogger(__name__)

MAX_PAYLOAD_BYTES = 65536  # 64 KB limit
MAX_EVENTS_PER_MINUTE = 60


def db_async(func):
    """Runs DB operations on the threadpool with connection cleanup and thread_sensitive=False."""
    return DatabaseSyncToAsync(func, thread_sensitive=False)


def _extract_privacy_dict(user):
    try:
        profile = user.profile
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


@db_async
def get_user_privacy_profile(user):
    if hasattr(user, "_state"):
        return _extract_privacy_dict(user)
    return _extract_privacy_dict(user)


@db_async
def set_user_online_status(user, is_online: bool):
    """Updates presence via pooled Redis multi-device connection counter and avoids redundant DB writes."""
    try:
        r = get_redis_client()
        should_update_db = True
        if r:
            key = f"ws:online_conns:{user.id}"
            if is_online:
                cnt = r.incr(key)
                r.expire(key, 3600)
                should_update_db = (cnt == 1)
            else:
                cnt = r.decr(key)
                if cnt <= 0:
                    r.delete(key)
                    should_update_db = True
                else:
                    should_update_db = False

        if should_update_db:
            next_status = "online" if is_online else "offline"
            User.objects.filter(id=user.id).update(status=next_status)
            if not is_online:
                UserProfile.objects.filter(user_id=user.id).update(online_status="offline", last_seen=timezone.now())
    except Exception as e:
        logger.error("Error setting presence: %s", str(e))


@db_async
def get_user_conversation_ids(user):
    return list(ConversationMember.objects.filter(user=user).values_list("conversation_id", flat=True))


@db_async
def clear_member_unread_count(user, chat_id):
    try:
        ConversationMember.objects.filter(
            conversation_id=chat_id, user=user, unread_count__gt=0
        ).update(unread_count=0)
    except Exception:
        pass


@db_async
def verify_conversation_membership(user, conversation_id):
    if not conversation_id:
        return False
    return ConversationMember.objects.filter(user=user, conversation_id=conversation_id).exists()


@db_async
def check_user_blocked(user, conversation_id):
    """Verifies that in a direct conversation, neither party blocked the other."""
    try:
        conv = Conversation.objects.filter(id=conversation_id).first()
        if not conv or conv.group_chat:
            return False
        other_id = conv.member_records.exclude(user=user).values_list("user_id", flat=True).first()
        if not other_id:
            return False
        return BlockedUser.objects.filter(
            Q(user=user, blocked_user_id=other_id) | Q(user_id=other_id, blocked_user=user)
        ).exists()
    except Exception:
        return False


@db_async
def save_incoming_message(
    sender,
    chat_id,
    content,
    client_msg_id="",
    reply_to=None,
    attachments=None,
    msg_type="text",
    membership_verified=False,
    topic_name="",
    thread_root_id=None,
):
    try:
        conv = Conversation.objects.filter(id=chat_id).first()
        if not conv:
            return None, "Conversation not found", None
        if not membership_verified and not conv.member_records.filter(user=sender).exists():
            return None, "Not a member of this conversation", None

        if conv.restricted_messages and not (conv.admins.filter(id=sender.id).exists() or conv.creator_id == sender.id):
            return None, "Only admins may post messages in this restricted group.", None

        # User blocking check
        if not conv.group_chat:
            other_id = conv.member_records.exclude(user=sender).values_list("user_id", flat=True).first()
            if other_id:
                if BlockedUser.objects.filter(
                    Q(user=sender, blocked_user_id=other_id) | Q(user_id=other_id, blocked_user=sender)
                ).exists():
                    return None, "Unable to send message due to block status.", None

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
                }, None, None

        # Ephemeral TTL
        expires_at = None
        if conv.ephemeral_ttl and conv.ephemeral_ttl > 0:
            expires_at = timezone.now() + timedelta(seconds=conv.ephemeral_ttl)

        clean_topic = str(topic_name or "").strip().lstrip("#")[:64]
        parsed_thread_root = None
        if thread_root_id:
            import uuid as _uuid
            try:
                parsed_thread_root = _uuid.UUID(str(thread_root_id))
            except ValueError:
                parsed_thread_root = None

        msg = Message.objects.create(
            conversation=conv,
            sender=sender,
            client_message_id=client_msg_id or "",
            message_type=msg_type,
            content=content,
            attachments=attachments or [],
            reply_to=reply_to,
            topic_name=clean_topic,
            thread_root_id=parsed_thread_root,
            status="sent",
            expires_at=expires_at,
        )

        conv.updated_at = timezone.now()
        conv.save(update_fields=["updated_at"])

        from django.db import models as dj_models
        ConversationMember.objects.filter(
            conversation=conv, is_deleted_for_user=True
        ).update(is_deleted_for_user=False)
        ConversationMember.objects.filter(
            conversation=conv
        ).exclude(user=sender).update(unread_count=dj_models.F("unread_count") + 1)

        recipient_ids = [str(uid) for uid in conv.member_records.values_list("user_id", flat=True)]

        serialized_msg = {
            "_id": str(msg.id),
            "id": str(msg.id),
            "content": content,
            "sender": {
                "_id": str(sender.id),
                "id": str(sender.id),
                "name": sender.name,
                "username": sender.username,
                "avatar": sender.avatar.get("url") if isinstance(sender.avatar, dict) else None,
            },
            "chat": str(conv.id),
            "conversation_id": str(conv.id),
            "client_message_id": client_msg_id,
            "attachments": attachments or [],
            "message_type": msg_type,
            "isEdited": False,
            "isDeleted": False,
            "reactions": [],
            "replyTo": reply_to,
            "topicName": clean_topic,
            "threadRootId": str(parsed_thread_root) if parsed_thread_root else None,
            "replyCount": 0,
            "viewOnce": False,
            "viewedBy": [],
            "readBy": [str(sender.id)],
            "createdAt": msg.created_at.isoformat(),
            "expiresAt": expires_at.isoformat() if expires_at else None,
            "recipient_ids": recipient_ids,
        }

        outbox_entry = OutboxService.create_outbox_event(
            event_type="message.created",
            conversation_id=str(conv.id),
            payload={
                "event": "message.created",
                "legacy_event": "NEW_MESSAGE",
                "chatId": str(conv.id),
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
                "message": serialized_msg,
            }
        )

        return serialized_msg, None, outbox_entry
    except Exception as e:
        logger.error("Error saving incoming message: %s", str(e))
        return None, str(e), None


@db_async
def record_read_receipt(user, message_ids, chat_id):
    try:
        from apps.messages_app.interactive import apply_seen_ephemeral_expiry

        user_id_str = str(user.id)
        messages = list(Message.objects.filter(id__in=message_ids, conversation_id=chat_id))
        to_update = []
        receipt_objs = []
        for m in messages:
            read_list = list(m.read_by or [])
            if user_id_str not in read_list:
                read_list.append(user_id_str)
                m.read_by = read_list
                to_update.append(m)
            receipt_objs.append(MessageReceipt(message=m, user=user, status="read"))

        if to_update:
            Message.objects.bulk_update(to_update, ["read_by"])
        if receipt_objs:
            MessageReceipt.objects.bulk_create(receipt_objs, ignore_conflicts=True)

        conv = Conversation.objects.filter(id=chat_id).first()
        expires_map = apply_seen_ephemeral_expiry(conv, messages, user.id) if conv else {}

        ConversationMember.objects.filter(
            conversation_id=chat_id, user=user, unread_count__gt=0
        ).update(unread_count=0)
        return expires_map
    except Exception as e:
        logger.error("Error marking messages read: %s", str(e))
        return {}


class ChatConsumer(AsyncJsonWebsocketConsumer):
    async def _is_member_cached(self, chat_id) -> bool:
        if not chat_id:
            return False
        cid_str = str(chat_id)
        if hasattr(self, "conv_id_set") and cid_str in self.conv_id_set:
            return True
        is_member = await verify_conversation_membership(self.user, cid_str)
        if is_member:
            if not hasattr(self, "conv_id_set"):
                self.conv_id_set = set()
            self.conv_id_set.add(cid_str)
            await self.channel_layer.group_add(f"chat_{cid_str}", self.channel_name)
        return is_member

    async def connect(self):
        self.user = self.scope.get("user")
        if not self.user or not self.user.is_authenticated:
            await self.close(code=4001)
            return

        self.event_timestamps = []
        self.user_group = f"user_{self.user.id}"

        self.conv_ids = await get_user_conversation_ids(self.user)
        self.conv_id_set = {str(cid) for cid in self.conv_ids}

        group_adds = [self.channel_layer.group_add(self.user_group, self.channel_name)]
        group_adds.extend(
            self.channel_layer.group_add(f"chat_{cid}", self.channel_name) for cid in self.conv_ids
        )
        await asyncio.gather(*group_adds)

        await set_user_online_status(self.user, True)
        privacy = await get_user_privacy_profile(self.user)
        self.privacy = privacy

        await self.accept()

        await self.send_json({
            "event": "connection.ready",
            "user_id": str(self.user.id),
            "timestamp": timezone.now().isoformat(),
        })

        if privacy.get("privacy_online") != "nobody" and self.conv_ids:
            packet = {
                "type": "chat.event",
                "event": "user.online",
                "event_legacy": "ONLINE_USERS",
                "data": {"user_id": str(self.user.id), "status": "online"},
            }
            await asyncio.gather(*(self.channel_layer.group_send(f"chat_{cid}", packet) for cid in self.conv_ids[:50]))

    async def disconnect(self, close_code):
        if hasattr(self, "user") and self.user.is_authenticated:
            discards = [self.channel_layer.group_discard(self.user_group, self.channel_name)]
            if hasattr(self, "conv_ids"):
                discards.extend(
                    self.channel_layer.group_discard(f"chat_{cid}", self.channel_name) for cid in self.conv_ids
                )
            await asyncio.gather(*discards, return_exceptions=True)

            await set_user_online_status(self.user, False)

            if getattr(self, "privacy", {}).get("privacy_online") != "nobody" and hasattr(self, "conv_ids") and self.conv_ids:
                packet = {
                    "type": "chat.event",
                    "event": "user.offline",
                    "event_legacy": "ONLINE_USERS",
                    "data": {"user_id": str(self.user.id), "status": "offline"},
                }
                await asyncio.gather(*(self.channel_layer.group_send(f"chat_{cid}", packet) for cid in self.conv_ids[:50]), return_exceptions=True)

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
            topic_name = data.get("topicName") or data.get("topic_name") or ""
            thread_root_id = data.get("threadRootId") or data.get("thread_root_id") or None

            is_member = await self._is_member_cached(chat_id)
            if not is_member:
                await self.send_json({"event": "error", "message": "Access denied. You are not a member of this conversation."})
                return

            saved_data, err, outbox_entry = await save_incoming_message(
                self.user, chat_id, message_text,
                client_msg_id=client_msg_id,
                reply_to=reply_to,
                attachments=attachments,
                msg_type=msg_type,
                membership_verified=True,
                topic_name=topic_name,
                thread_root_id=thread_root_id,
            )

            if saved_data:
                await self.send_json({
                    "event": "message.ack",
                    "client_message_id": client_msg_id,
                    "message_id": saved_data["_id"],
                    "timestamp": saved_data["createdAt"],
                })
                if outbox_entry:
                    await OutboxService.publish_item_async(outbox_entry)
            else:
                await self.send_json({
                    "event": "error",
                    "client_message_id": client_msg_id,
                    "message": err or "Failed to send message.",
                })

        # 4. Typing Indicators (zero DB hits via membership cache)
        elif event in ("typing.start", "START_TYPING"):
            chat_id = data.get("chatId") or data.get("conversation_id")
            if await self._is_member_cached(chat_id) and getattr(self, "privacy", {}).get("privacy_typing_indicator", True):
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
            if await self._is_member_cached(chat_id):
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
            chat_id = data.get("chatId") or content.get("conversation_id") or data.get("conversation_id")
            if not await self._is_member_cached(chat_id):
                return

            message_ids = data.get("messageIds") or [data.get("message_id")]
            message_ids = [m for m in message_ids if m]

            if getattr(self, "privacy", {}).get("privacy_read_receipts", True):
                expires_map = await record_read_receipt(self.user, message_ids, chat_id)
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
                            "expiresMap": expires_map,
                        }
                    }
                )
            else:
                await clear_member_unread_count(self.user, chat_id)
                await self.channel_layer.group_send(
                    self.user_group,
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

        # 6. Interactive Live Relays (Watch Party, Live Whiteboard, Live Location, Walkie-Talkie)
        elif event in ("watch.sync", "whiteboard.sync", "location.live", "walkie.signal"):
            chat_id = data.get("chatId") or data.get("conversation_id")
            if not await self._is_member_cached(chat_id):
                return
            enriched = {
                **(data if isinstance(data, dict) else {}),
                "chatId": str(chat_id),
                "senderId": str(self.user.id),
                "senderName": self.user.name or self.user.username,
            }
            await self.channel_layer.group_send(
                f"chat_{chat_id}",
                {
                    "type": "chat.event",
                    "event": event,
                    "event_legacy": None,
                    "data": enriched,
                },
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
