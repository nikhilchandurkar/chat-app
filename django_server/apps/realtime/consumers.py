import json
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.core.cache import cache

from apps.authentication.models import User
from apps.chat.models import Chat
from apps.messages_app.models import Message


ONLINE_USERS_CACHE_KEY = "online_users_set"


@database_sync_to_async
def save_new_message(sender, chat_id, text, reply_to=None):
    try:
        chat = Chat.objects.get(id=chat_id)
        if not chat.members.filter(id=sender.id).exists():
            return None, "Not a member of this chat"
        if chat.restricted_messages and not (chat.admins.filter(id=sender.id).exists() or chat.creator_id == sender.id):
            return None, "Only admins can send messages in this restricted chat"

        msg = Message.objects.create(
            sender=sender,
            chat=chat,
            content=text,
            reply_to=reply_to
        )
        return {
            "_id": str(msg.id),
            "content": text,
            "sender": {
                "_id": str(sender.id),
                "name": sender.name,
                "avatar": sender.avatar.get("url") if isinstance(sender.avatar, dict) else None,
            },
            "chat": str(chat.id),
            "attachments": [],
            "isEdited": False,
            "isDeleted": False,
            "reactions": [],
            "replyTo": reply_to,
            "readBy": [str(sender.id)],
            "createdAt": msg.created_at.isoformat(),
        }, None
    except Exception as e:
        return None, str(e)


@database_sync_to_async
def mark_messages_read(user, message_ids):
    try:
        user_id_str = str(user.id)
        messages = Message.objects.filter(id__in=message_ids)
        for m in messages:
            read_list = list(m.read_by or [])
            if user_id_str not in read_list:
                read_list.append(user_id_str)
                m.read_by = read_list
                m.save(update_fields=["read_by"])
        return True
    except Exception:
        return False


class ChatConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user = self.scope.get("user")
        if not self.user or not self.user.is_authenticated:
            await self.close()
            return

        self.user_group = f"user_{self.user.id}"
        self.global_group = "global_chat"

        await self.channel_layer.group_add(self.user_group, self.channel_name)
        await self.channel_layer.group_add(self.global_group, self.channel_name)

        # Track online status in cache
        online_users = cache.get(ONLINE_USERS_CACHE_KEY) or []
        user_id_str = str(self.user.id)
        if user_id_str not in online_users:
            online_users.append(user_id_str)
            cache.set(ONLINE_USERS_CACHE_KEY, online_users, timeout=None)

        await self.accept()

        # Broadcast online users to everyone
        await self.channel_layer.group_send(
            self.global_group,
            {
                "type": "chat.event",
                "event": "ONLINE_USERS",
                "data": online_users,
            }
        )

    async def disconnect(self, close_code):
        if hasattr(self, "user") and self.user.is_authenticated:
            await self.channel_layer.group_discard(self.user_group, self.channel_name)
            await self.channel_layer.group_discard(self.global_group, self.channel_name)

            online_users = cache.get(ONLINE_USERS_CACHE_KEY) or []
            user_id_str = str(self.user.id)
            if user_id_str in online_users:
                online_users.remove(user_id_str)
                cache.set(ONLINE_USERS_CACHE_KEY, online_users, timeout=None)

            # Broadcast updated online users
            await self.channel_layer.group_send(
                self.global_group,
                {
                    "type": "chat.event",
                    "event": "ONLINE_USERS",
                    "data": online_users,
                }
            )

    async def receive_json(self, content):
        event = content.get("event") or content.get("type")
        data = content.get("data", content)

        if event == "NEW_MESSAGE":
            chat_id = data.get("chatId")
            message_text = data.get("message")
            reply_to = data.get("replyTo")
            members = data.get("members", [])

            saved_data, err = await save_new_message(self.user, chat_id, message_text, reply_to)
            if saved_data:
                for uid in members:
                    await self.channel_layer.group_send(
                        f"user_{uid}",
                        {
                            "type": "chat.event",
                            "event": "NEW_MESSAGE",
                            "data": {
                                "chatId": chat_id,
                                "message": saved_data,
                            }
                        }
                    )
                    # Also send unread count/alert to members (other than sender)
                    if str(uid) != str(self.user.id):
                        await self.channel_layer.group_send(
                            f"user_{uid}",
                            {
                                "type": "chat.event",
                                "event": "NEW_MESSAGE_ALERT",
                                "data": {"chatId": chat_id}
                            }
                        )

        elif event == "START_TYPING":
            chat_id = data.get("chatId")
            members = data.get("members", [])
            for uid in members:
                if str(uid) != str(self.user.id):
                    await self.channel_layer.group_send(
                        f"user_{uid}",
                        {
                            "type": "chat.event",
                            "event": "START_TYPING",
                            "data": {"chatId": chat_id}
                        }
                    )

        elif event == "STOP_TYPING":
            chat_id = data.get("chatId")
            members = data.get("members", [])
            for uid in members:
                if str(uid) != str(self.user.id):
                    await self.channel_layer.group_send(
                        f"user_{uid}",
                        {
                            "type": "chat.event",
                            "event": "STOP_TYPING",
                            "data": {"chatId": chat_id}
                        }
                    )

        elif event == "MESSAGE_READ":
            chat_id = data.get("chatId")
            message_ids = data.get("messageIds", [])
            members = data.get("members", [])

            await mark_messages_read(self.user, message_ids)
            for uid in members:
                await self.channel_layer.group_send(
                    f"user_{uid}",
                    {
                        "type": "chat.event",
                        "event": "MESSAGE_READ_UPDATE",
                        "data": {
                            "chatId": chat_id,
                            "messageIds": message_ids,
                            "readBy": str(self.user.id)
                        }
                    }
                )

    async def chat_event(self, event):
        """Handler for 'chat.event' type sent by group_send."""
        await self.send_json({
            "event": event["event"],
            "data": event["data"],
        })

