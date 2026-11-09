# Transactional Email System & SMTP Configuration

## 1. Overview

The messaging platform features an enterprise transactional email engine implemented in `apps.authentication.services.email_service.py`. It powers passwordless OTP authentication, security alerts, device verification, account management notifications, and group invitations.

All emails are generated using:
- **Base Layout (`base_email.html`)**: Responsive design, SVG vector branding, accessible contrast ratios, and security footer notices.
- **Dual Formats**: Every email dispatches an HTML version alongside an auto-generated or explicitly formatted plain-text fallback for text-only email clients.

---

## 2. Inventory of Transactional Email Templates

All templates reside in `django_server/templates/emails/`:

| Template Key | HTML File | Purpose / Trigger Event |
| :--- | :--- | :--- |
| `otp_verification` | `otp_verification.html` | Dispatches 6-digit cryptographic verification code with 5-minute expiry notice. |
| `welcome` | `welcome.html` | Welcomes first-time registered users, explaining key privacy features. |
| `new_device_login` | `new_device_login.html` | Security alert with IP address, browser/device info, and UTC timestamp when a login from an untrusted session is detected. |
| `account_recovery` | `account_recovery.html` | Dispatches recovery confirmation and instructions when a user initiates account recovery. |
| `oauth_linked` | `oauth_linked.html` | Confirms when a third-party OAuth account (Google, GitHub, Facebook) is linked. |
| `oauth_unlinked` | `oauth_unlinked.html` | Security warning when an OAuth provider is unlinked. |
| `security_alert` | `security_alert.html` | General security notification for passwordless updates, profile privacy shifts, or lockout incidents. |
| `group_invitation` | `group_invitation.html` | Direct email invitation containing a secure hashed invitation link and group metadata. |
| `account_deleted` | `account_deleted.html` | Final confirmation of GDPR account erasure. |

---

## 3. SMTP Provider Configuration Options

Update your `.env` file with the settings corresponding to your chosen provider:

### Option A: Amazon Simple Email Service (SES) - Recommended for Production

```dotenv
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USE_TLS=True
SMTP_USERNAME=your_ses_smtp_username
SMTP_PASSWORD=your_ses_smtp_password
DEFAULT_FROM_EMAIL="Secure Chat" <notifications@yourdomain.com>
```

### Option B: SendGrid

```dotenv
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USE_TLS=True
SMTP_USERNAME=apikey
SMTP_PASSWORD=your_sendgrid_api_key
DEFAULT_FROM_EMAIL="Secure Chat" <notifications@yourdomain.com>
```

### Option C: Gmail SMTP (Development / Small Deployments)

*Note: Requires an **App Password** generated from Google Account > Security > 2-Step Verification > App passwords.*

```dotenv
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USE_TLS=True
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_16_character_app_password
DEFAULT_FROM_EMAIL="Secure Chat" <your_email@gmail.com>
```

### Option D: Console Backend (Local Offline Testing)

Logs all generated emails directly to the Daphne terminal window without network activity:

```dotenv
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
```

---

## 4. Deliverability Hardening (SPF, DKIM & DMARC)

To prevent OTP emails from landing in spam or junk folders, configure the following DNS records on your domain:

1. **SPF (Sender Policy Framework)**:
   ```
   v=spf1 include:amazonses.com ~all
   ```
2. **DKIM (DomainKeys Identified Mail)**:
   Add the 3 CNAME records generated in your Amazon SES or email provider console.
3. **DMARC**:
   ```
   v=DMARC1; p=reject; rua=mailto:dmarc-reports@yourdomain.com; pct=100
   ```

---

## 5. Testing Email Dispatch

To test email configuration via Django shell:

```bash
cd django_server
python manage.py shell
```

```python
from apps.authentication.services.email_service import EmailService

# Test OTP dispatch
success = EmailService.send_otp_email(
    to_email="test@yourdomain.com",
    otp_code="123456",
    expiry_minutes=5
)
print("Email sent:", success)
```

