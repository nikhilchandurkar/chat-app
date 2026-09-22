from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings

@shared_task(time_limit=30, retry_backoff=True, max_retries=3)
def send_otp_email_task(email, otp):
    subject = "Your ChatApp Verification Code"
    message = f"Hello,\n\nYour one-time login verification code is:\n\n{otp}\n\nThis code expires in 5 minutes.\nIf you did not request this code, please ignore this email."
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=False,
    )
    return f"OTP sent to {email}"

@shared_task(time_limit=30, retry_backoff=True, max_retries=3)
def send_reset_password_email_task(email, reset_url, name="there"):
    subject = "Reset Your ChatApp Password"
    message = f"Hi {name},\n\nWe received a request to reset your password. Click the link below:\n\n{reset_url}\n\nThis link expires in 1 hour."
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=False,
    )
    return f"Reset link sent to {email}"

