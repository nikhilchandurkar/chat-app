import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(ignore_result=True, soft_time_limit=15)
def dispatch_push_notifications_task(payload: dict) -> None:
    """Delivers FCM & Web Push notifications asynchronously outside message-send latency path."""
    from apps.notifications.services.fcm_service import FCMService
    from apps.notifications.services.webpush_service import WebPushService

    sender_name = payload.get("sender_name", "Someone")
    content_preview = payload.get("content", "Sent an attachment")
    if isinstance(content_preview, str) and content_preview.startswith("ENC:"):
        content_preview = "New encrypted message"
    conversation_id = payload.get("conversation_id", "")
    recipients = payload.get("recipient_ids", [])
    sender_id = payload.get("sender_id", "")

    for rec_id in recipients:
        if str(rec_id) == str(sender_id):
            continue
        try:
            FCMService.send_fcm_notification(
                user_id=rec_id,
                title=f"Message from {sender_name}",
                body=str(content_preview)[:120],
                data={"conversation_id": str(conversation_id)},
            )
            WebPushService.send_web_push(
                user_id=rec_id,
                title=f"New message from {sender_name}",
                body=str(content_preview)[:120],
                data={"conversation_id": str(conversation_id)},
            )
        except Exception as exc:
            logger.warning("Async push failed for recipient %s: %s", rec_id, str(exc))

