import json
import logging
from django.conf import settings
from apps.notifications.models import WebPushSubscription, NotificationPreference

logger = logging.getLogger(__name__)


class WebPushService:
    @classmethod
    def send_web_push(cls, user_id, title: str, body: str, data: dict = None) -> int:
        """
        Sends self-hosted browser Web Push using VAPID keys and pywebpush.
        Works across Chrome, Edge, Firefox, Safari on desktop and mobile browsers.
        """
        if data is None:
            data = {}

        # Check preferences
        pref = NotificationPreference.objects.filter(user_id=user_id).first()
        if pref and not pref.web_push_enabled:
            return 0

        subscriptions = WebPushSubscription.objects.filter(user_id=user_id)
        if not subscriptions.exists():
            return 0

        vapid_private_key = getattr(settings, "VAPID_PRIVATE_KEY", "")
        vapid_claims = {
            "sub": f"mailto:{getattr(settings, 'VAPID_CLAIM_EMAIL', 'admin@chatapp.local')}"
        }

        payload = json.dumps({
            "title": title,
            "body": body,
            "data": data,
            "icon": "/icon-192.png",
            "badge": "/badge-72.png",
        })

        successful = 0

        if not vapid_private_key:
            logger.info("[DEV WEBPUSH] VAPID keys not set. Simulating web push '%s' to %d subscription(s)", title, subscriptions.count())
            return subscriptions.count()

        from pywebpush import webpush, WebPushException

        for sub in subscriptions:
            subscription_info = {
                "endpoint": sub.endpoint,
                "keys": {
                    "p256dh": sub.p256dh_key,
                    "auth": sub.auth_key,
                }
            }

            try:
                webpush(
                    subscription_info=subscription_info,
                    data=payload,
                    vapid_private_key=vapid_private_key,
                    vapid_claims=vapid_claims,
                    ttl=86400,
                )
                successful += 1
            except WebPushException as ex:
                logger.warning("WebPush failed: %s", str(ex))
                # If subscription has expired or is unsubscribed (HTTP 404 or 410)
                if ex.response is not None and ex.response.status_code in (404, 410):
                    logger.info("Cleaning up expired web push subscription %s", sub.id)
                    sub.delete()
            except Exception as e:
                logger.error("WebPush unknown error: %s", str(e))

        return successful

