import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)

@shared_task(name="apps.messages_app.tasks.flush_scheduled_messages_task", ignore_result=True)
def flush_scheduled_messages_task(conversation_id=None):
    """
    Background worker task to promote due scheduled messages & reminders
    into active delivered messages and broadcast them over WebSockets.
    """
    try:
        from .interactive import flush_due_scheduled_messages
        delivered = flush_due_scheduled_messages(conversation_id=conversation_id)
        if delivered > 0:
            logger.info("Flushed and delivered %d due scheduled message(s)", delivered)
        return delivered
    except Exception as exc:
        logger.warning("Error flushing due scheduled messages: %s", exc)
        return 0
