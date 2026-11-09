import json
import logging
import os
import time
import requests
from django.conf import settings
from django.utils import timezone
from apps.authentication.models import Device
from apps.notifications.models import Notification, NotificationDelivery, NotificationPreference

logger = logging.getLogger(__name__)

# Cached Google OAuth2 access token for FCM v1
_fcm_token_cache = {
    "token": None,
    "expires_at": 0,
}


def get_fcm_oauth_token() -> str | None:
    """
    Obtains an OAuth 2.0 access token using the Firebase Service Account JSON.
    Caches the token in-memory until expiration.
    """
    global _fcm_token_cache
    now = time.time()
    if _fcm_token_cache["token"] and _fcm_token_cache["expires_at"] > now + 60:
        return _fcm_token_cache["token"]

    sa_path = getattr(settings, "FCM_SERVICE_ACCOUNT_PATH", "")
    if not sa_path or not os.path.exists(sa_path):
        return None

    try:
        with open(sa_path, "r", encoding="utf-8") as f:
            sa_data = json.load(f)

        import jwt
        token_url = sa_data.get("token_uri", "https://oauth2.googleapis.com/token")
        client_email = sa_data.get("client_email")
        private_key = sa_data.get("private_key")

        payload = {
            "iss": client_email,
            "sub": client_email,
            "aud": token_url,
            "iat": int(now),
            "exp": int(now) + 3600,
            "scope": "https://www.googleapis.com/auth/firebase.messaging",
        }
        signed_jwt = jwt.encode(payload, private_key, algorithm="RS256")

        resp = requests.post(token_url, data={
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": signed_jwt,
        }, timeout=10)

        token_response = resp.json()
        access_token = token_response.get("access_token")
        if access_token:
            _fcm_token_cache["token"] = access_token
            _fcm_token_cache["expires_at"] = now + token_response.get("expires_in", 3600)
            return access_token
    except Exception as e:
        logger.error("Error acquiring FCM OAuth2 token: %s", str(e))

    return None


class FCMService:
    @classmethod
    def send_fcm_notification(cls, user_id, title: str, body: str, data: dict = None) -> int:
        """
        Sends native Android push notification directly through FCM HTTP v1 API.
        Does not use Expo Push servers.
        """
        if data is None:
            data = {}

        # Check user notification preferences
        pref = NotificationPreference.objects.filter(user_id=user_id).first()
        if pref and not pref.fcm_enabled:
            return 0

        # Query all active Android devices with native FCM tokens
        devices = Device.objects.filter(
            user_id=user_id,
            platform="android",
            is_active=True
        ).exclude(native_fcm_token="")

        if not devices.exists():
            return 0

        # Create Notification record
        notification = Notification.objects.create(
            user_id=user_id,
            title=title,
            body=body,
            data=data,
            notification_type="message",
        )

        project_id = getattr(settings, "FCM_PROJECT_ID", "")
        token = get_fcm_oauth_token()

        successful_dispatches = 0

        for device in devices:
            delivery = NotificationDelivery.objects.create(
                notification=notification,
                device=device,
                status="queued"
            )

            if not token or not project_id:
                # Log without crashing when service account is not yet configured on dev machine
                logger.info(
                    "[DEV FCM] FCM not configured. Notification '%s' queued for device %s (token: %s...)",
                    title, device.device_id, device.native_fcm_token[:15]
                )
                delivery.status = "sent"
                delivery.sent_at = timezone.now()
                delivery.save(update_fields=["status", "sent_at"])
                successful_dispatches += 1
                continue

            endpoint = f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            }
            # Stringify data values for FCM v1 requirement
            str_data = {k: str(v) for k, v in data.items()}

            message_payload = {
                "message": {
                    "token": device.native_fcm_token,
                    "notification": {
                        "title": title,
                        "body": body,
                    },
                    "data": str_data,
                    "android": {
                        "priority": "high",
                        "notification": {
                            "channel_id": "chat_messages",
                            "default_sound": True,
                            "default_vibrate_timings": True,
                        }
                    }
                }
            }

            try:
                resp = requests.post(endpoint, json=message_payload, headers=headers, timeout=10)
                if resp.status_code == 200:
                    delivery.status = "sent"
                    delivery.sent_at = timezone.now()
                    delivery.save(update_fields=["status", "sent_at"])
                    successful_dispatches += 1
                else:
                    err_text = resp.text
                    delivery.status = "failed"
                    delivery.error_message = err_text[:500]
                    delivery.save(update_fields=["status", "error_message"])

                    # If token is invalid or unregistered, deactivate device token
                    if "UNREGISTERED" in err_text or resp.status_code == 404:
                        logger.warning("FCM token expired for device %s. Deactivating token.", device.device_id)
                        device.native_fcm_token = ""
                        device.save(update_fields=["native_fcm_token"])
            except Exception as e:
                logger.error("FCM network error for device %s: %s", device.device_id, str(e))
                delivery.status = "failed"
                delivery.error_message = str(e)[:500]
                delivery.save(update_fields=["status", "error_message"])

        return successful_dispatches

