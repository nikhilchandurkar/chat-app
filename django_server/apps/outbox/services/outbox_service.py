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
    def publish_item(cls, item: MessageOutbox) -> bool:
        """Publishes a single outbox event directly without scanning the outbox table."""
        channel_layer = get_channel_layer()

        publish_to_stream(
            stream_name=item.stream_name,
            event_id=item.event_id,
            event_type=item.event_type,
            payload=item.payload,
        )

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

            if conversation_id:
                try:
                    async_to_sync(channel_layer.group_send)(f"chat_{conversation_id}", event_packet)
                except Exception as err:
                    logger.warning("Failed Channels group_send to chat_%s: %s", conversation_id, str(err))
            else:
                for uid in recipient_ids:
                    try:
                        async_to_sync(channel_layer.group_send)(f"user_{uid}", event_packet)
                    except Exception as err:
                        logger.warning("Failed Channels group_send to user_%s: %s", uid, str(err))

        if item.event_type in ("message.created", "NEW_MESSAGE"):
            try:
                cls._dispatch_notifications(item.payload)
            except Exception as ne:
                logger.warning("Notification dispatch failed for %s: %s", item.event_id, str(ne))

        item.status = "published"
        item.processed_at = timezone.now()
        item.save(update_fields=["status", "processed_at"])
        return True

    @classmethod
    async def publish_item_async(cls, item: MessageOutbox) -> bool:
        """Async outbox publisher for WebSocket consumers running on the ASGI event loop."""
        from channels.db import DatabaseSyncToAsync
        import asyncio

        channel_layer = get_channel_layer()
        recipient_ids = item.payload.get("recipient_ids", [])
        conversation_id = item.conversation_id

        # Push onto Redis Stream + mark published in a quick thread call without bridging event loops
        def _record_stream_and_mark():
            publish_to_stream(
                stream_name=item.stream_name,
                event_id=item.event_id,
                event_type=item.event_type,
                payload=item.payload,
            )
            if item.event_type in ("message.created", "NEW_MESSAGE"):
                cls._dispatch_notifications(item.payload)
            MessageOutbox.objects.filter(id=item.id).update(
                status="published",
                processed_at=timezone.now(),
            )

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
            if conversation_id:
                await channel_layer.group_send(f"chat_{conversation_id}", event_packet)
            else:
                await asyncio.gather(*(channel_layer.group_send(f"user_{uid}", event_packet) for uid in recipient_ids))

        await DatabaseSyncToAsync(_record_stream_and_mark, thread_sensitive=False)()
        return True

    @classmethod
    def publish_pending(cls, limit: int = 50) -> int:
        """Drains pending events from the MySQL outbox table safely under concurrency."""
        from django.db import transaction

        published_count = 0
        with transaction.atomic():
            pending_events = list(
                MessageOutbox.objects.select_for_update(skip_locked=True)
                .filter(status="pending")
                .order_by("created_at")[:limit]
            )
            for item in pending_events:
                cls.publish_item(item)
                published_count += 1
        return published_count

    @staticmethod
    def _dispatch_notifications(payload: dict):
        """Offloads FCM and Web Push dispatch to Celery worker so chat latency stays sub-millisecond."""
        try:
            from apps.notifications.tasks import dispatch_push_notifications_task
            dispatch_push_notifications_task.delay(payload)
            return
        except Exception as err:
            logger.debug("Celery enqueue unavailable, skipping sync push on hot path: %s", str(err))

