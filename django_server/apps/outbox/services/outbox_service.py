import uuid
import logging
from django.utils import timezone
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from apps.outbox.models import MessageOutbox
from .redis_streams import publish_to_stream

logger = logging.getLogger(__name__)


class OutboxService:
    @staticmethod
    def create_outbox_event(event_type: str, conversation_id: str, payload: dict, stream_name: str = "chat:events") -> MessageOutbox:
        """
        Creates an outbox record inside the active MySQL transaction.
        Guarantees event persistence even if Redis is temporarily offline.
        """
        event_id = str(uuid.uuid4())
        outbox_entry = MessageOutbox.objects.create(
            event_id=event_id,
            event_type=event_type,
            conversation_id=conversation_id,
            stream_name=stream_name,
            payload=payload,
            status="pending",
            retry_count=0,
        )
        return outbox_entry

    @classmethod
    def publish_pending(cls, limit: int = 50) -> int:
        """
        Drains pending events from the MySQL outbox table,
        publishes to Redis Streams, broadcasts via Channels,
        and triggers notification dispatches.
        """
        pending_events = MessageOutbox.objects.filter(status="pending").order_by("created_at")[:limit]
        published_count = 0

        channel_layer = get_channel_layer()

        for item in pending_events:
            # Attempt publishing to Redis Streams
            msg_id = publish_to_stream(
                stream_name=item.stream_name,
                event_id=item.event_id,
                event_type=item.event_type,
                payload=item.payload
            )

            # Broadcast to Django Channels WebSocket groups
            recipient_ids = item.payload.get("recipient_ids", [])
            conversation_id = item.conversation_id

            if channel_layer:
                event_packet = {
                    "type": "chat.event",
                    "event": item.event_type,
                    "event_legacy": item.payload.get("legacy_event"),
                    "event_id": item.event_id,
                    "conversation_id": conversation_id,
                    "data": item.payload,
                    "timestamp": timezone.now().isoformat(),
                }

                # Send to user-specific groups
                for uid in recipient_ids:
                    try:
                        async_to_sync(channel_layer.group_send)(f"user_{uid}", event_packet)
                    except Exception as err:
                        logger.warning("Failed Channels group_send to user_%s: %s", uid, str(err))

                # Send to conversation group
                if conversation_id:
                    try:
                        async_to_sync(channel_layer.group_send)(f"chat_{conversation_id}", event_packet)
                    except Exception as err:
                        logger.warning("Failed Channels group_send to chat_%s: %s", conversation_id, str(err))

            # Trigger push notification dispatch for new messages
            if item.event_type in ("message.created", "NEW_MESSAGE"):
                try:
                    cls._dispatch_notifications(item.payload)
                except Exception as ne:
                    logger.warning("Notification dispatch failed for %s: %s", item.event_id, str(ne))

            # Update outbox status
            item.status = "published"
            item.processed_at = timezone.now()
            item.save(update_fields=["status", "processed_at"])
            published_count += 1

        return published_count

    @staticmethod
    def _dispatch_notifications(payload: dict):
        """Asynchronously dispatches FCM and Web Push notifications to recipient devices."""
        from apps.notifications.services.fcm_service import FCMService
        from apps.notifications.services.webpush_service import WebPushService

        sender_name = payload.get("sender_name", "Someone")
        content_preview = payload.get("content", "Sent an attachment")
        if content_preview.startswith("ENC:"):
            content_preview = "New encrypted message"
        conversation_id = payload.get("conversation_id", "")
        recipients = payload.get("recipient_ids", [])
        sender_id = payload.get("sender_id", "")

        for rec_id in recipients:
            if str(rec_id) == str(sender_id):
                continue  # Don't notify the sender

            # FCM Android Push
            FCMService.send_fcm_notification(
                user_id=rec_id,
                title=f"Message from {sender_name}",
                body=content_preview[:120],
                data={"conversation_id": str(conversation_id)}
            )

            # Web Browser Push
            WebPushService.send_web_push(
                user_id=rec_id,
                title=f"New message from {sender_name}",
                body=content_preview[:120],
                data={"conversation_id": str(conversation_id)}
            )

