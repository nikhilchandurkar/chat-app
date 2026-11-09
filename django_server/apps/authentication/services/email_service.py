import logging
from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils import timezone

logger = logging.getLogger(__name__)


class EmailNotificationService:
    @staticmethod
    def _send_templated_email(template_base: str, context: dict, recipient_email: str, subject: str) -> bool:
        context.setdefault("app_name", "ChatApp")
        context.setdefault("timestamp", timezone.now().strftime("%Y-%m-%d %H:%M:%S UTC"))
        context.setdefault("subject", subject)

        try:
            html_content = render_to_string(f"emails/{template_base}.html", context)
            text_content = render_to_string(f"emails/{template_base}.txt", context)

            send_mail(
                subject=subject,
                message=text_content,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[recipient_email],
                html_message=html_content,
                fail_silently=False,
            )
            return True
        except Exception as e:
            logger.error("Failed to send templated email '%s' to %s: %s", template_base, recipient_email, str(e))
            if settings.DEBUG:
                logger.info("[DEV] Mocked or failed email dispatch for %s (template %s)", recipient_email, template_base)
                return True
            return False

    @classmethod
    def send_otp(cls, email: str, otp: str, expiry_minutes: int = 5) -> bool:
        return cls._send_templated_email(
            template_base="otp_verification",
            context={"otp": otp, "expiry_minutes": expiry_minutes},
            recipient_email=email,
            subject="Your ChatApp Verification Code",
        )

    @classmethod
    def send_welcome(cls, email: str, user_name: str) -> bool:
        return cls._send_templated_email(
            template_base="welcome",
            context={"user_name": user_name},
            recipient_email=email,
            subject="Welcome to ChatApp!",
        )

    @classmethod
    def send_new_device_login(cls, email: str, user_name: str, platform: str, ip_address: str, user_agent: str) -> bool:
        return cls._send_templated_email(
            template_base="new_device_login",
            context={
                "user_name": user_name,
                "platform": platform,
                "ip_address": ip_address,
                "user_agent": user_agent,
            },
            recipient_email=email,
            subject="Security Alert: New Device Login to ChatApp",
        )

    @classmethod
    def send_account_recovery(cls, email: str, user_name: str) -> bool:
        return cls._send_templated_email(
            template_base="account_recovery",
            context={"user_name": user_name},
            recipient_email=email,
            subject="ChatApp Account Recovered Successfully",
        )

    @classmethod
    def send_oauth_linked(cls, email: str, user_name: str, provider: str, provider_email: str) -> bool:
        return cls._send_templated_email(
            template_base="oauth_linked",
            context={"user_name": user_name, "provider": provider, "provider_email": provider_email},
            recipient_email=email,
            subject=f"Security Notice: {provider.title()} Account Linked",
        )

    @classmethod
    def send_oauth_unlinked(cls, email: str, user_name: str, provider: str) -> bool:
        return cls._send_templated_email(
            template_base="oauth_unlinked",
            context={"user_name": user_name, "provider": provider},
            recipient_email=email,
            subject=f"Security Notice: {provider.title()} Account Disconnected",
        )

    @classmethod
    def send_security_alert(cls, email: str, user_name: str, alert_title: str, alert_message: str, ip_address: str = None) -> bool:
        return cls._send_templated_email(
            template_base="security_alert",
            context={
                "user_name": user_name,
                "alert_title": alert_title,
                "alert_message": alert_message,
                "ip_address": ip_address,
            },
            recipient_email=email,
            subject=f"Security Alert: {alert_title}",
        )

    @classmethod
    def send_account_deleted(cls, email: str, user_name: str) -> bool:
        return cls._send_templated_email(
            template_base="account_deleted",
            context={"user_name": user_name},
            recipient_email=email,
            subject="ChatApp Account Deactivated",
        )
