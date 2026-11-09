# Production Troubleshooting and Incident Diagnostic Guide

## 1. Quick Diagnostic Cheat-Sheet

| Symptom | Primary Suspect | Immediate Command |
| :--- | :--- | :--- |
| **502 Bad Gateway** on HTTP or WebSocket | Daphne ASGI server stopped or deadlocked | `sudo systemctl status chat-asgi` |
| **WebSocket 403 Forbidden** | Invalid/expired JWT token in query parameter | Inspect browser console network frame; verify token expiry |
| **WebSocket 1006 Abnormal Closure** | Redis Channel Layer unreachable or full | `redis-cli ping` & `sudo journalctl -u chat-asgi -n 50` |
| **Emails / OTP not arriving** | SMTP credentials rejected or port blocked | Inspect `mail.log` or run test dispatch via `python manage.py shell` |
| **File Upload returns 500** | Permission denied on storage mount | `ls -ld /var/chat_storage/private` |
| **Push notifications not delivered** | Google FCM Service Account path invalid | Check `/var/log/chat_outbox.log` |

---

## 2. Daphne ASGI Server & WebSocket Issues

### 2.1. Daphne Service Failed to Start
**Error**: `Address already in use` or immediate crash on boot.
**Resolution**:
1. Check if an orphaned Daphne process or gunicorn process is binding port 8000:
   ```bash
   sudo lsof -i :8000
   # Or in PowerShell:
   Get-NetTCPConnection -LocalPort 8000
   ```
2. Kill the orphaned PID:
   ```bash
   sudo kill -9 <PID>
   ```
3. Restart the service:
   ```bash
   sudo systemctl restart chat-asgi
   ```

### 2.2. WebSocket Handshake Fails (403 Forbidden)
**Error**: `WebSocket connection to 'wss://chat.yourdomain.com/ws/chat/?token=...' failed: Error during WebSocket handshake: Unexpected response code: 403`
**Root Cause**: The client provided an expired JWT token, or token was missing from query parameters.
**Resolution**:
1. Ensure the web or mobile client refreshes the JWT access token before opening the WebSocket connection.
2. Verify system clock synchronization on the server (`timedatectl status`). Clock drift can cause valid JWTs to be rejected as expired.

---

## 3. Database & MySQL 8+ Issues

### 3.1. `OperationalError: (2003, "Can't connect to MySQL server on '127.0.0.1'")`
**Root Cause**: MySQL daemon is inactive or listening only on a UNIX socket.
**Resolution**:
1. Check MySQL service status:
   ```bash
   sudo systemctl status mysql
   ```
2. If inactive, start MySQL:
   ```bash
   sudo systemctl start mysql
   ```
3. Verify connection locally:
   ```bash
   mysql -u chat_user -p -h 127.0.0.1 chat_db
   ```

### 3.2. Emoji Truncation or `Incorrect string value`
**Root Cause**: MySQL database or table collation was created as standard `utf8` (3-byte) instead of `utf8mb4` (4-byte).
**Resolution**:
Run the following SQL to convert tables:
```sql
ALTER DATABASE chat_db CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
ALTER TABLE messages_message CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

---

## 4. Redis & Channels Layer Diagnostics

### 4.1. `ChannelFull` or Redis Connection Refused
**Error**: `channels_redis.core.ChannelFull`
**Root Cause**: Inbound message rate exceeds the consumer processing throughput, filling up the Redis channel queue buffer.
**Resolution**:
1. Inspect Redis memory and client count:
   ```bash
   redis-cli info memory
   redis-cli info clients
   ```
2. Ensure `REDIS_URL` in `.env` is reachable.
3. If necessary, increase Daphne worker threads in `chat-asgi.service`.

---

## 5. Storage Subsystem & Attachment Upload Failures

### 5.1. `PermissionError: [Errno 13] Permission denied: '/var/chat_storage/private/...'`
**Root Cause**: The storage mount directory is owned by `root` instead of the web server runtime user (`www-data`).
**Resolution**:
```bash
sudo chown -R www-data:www-data /var/chat_storage
sudo chmod -R 770 /var/chat_storage
```

### 5.2. `413 Request Entity Too Large`
**Root Cause**: Nginx default client upload limit (1MB) blocked an attachment before reaching Django.
**Resolution**:
In `/etc/nginx/sites-available/chat-app`, ensure `client_max_body_size` is configured inside the `server` block:
```nginx
client_max_body_size 100M;
```
Reload Nginx: `sudo systemctl reload nginx`.

---

## 6. Email OTP Non-Delivery

### 6.1. SMTP Authentication Failure
**Error**: `smtplib.SMTPAuthenticationError: (535, '5.7.8 Username and Password not accepted')`
**Resolution**:
- If using Gmail: Standard account passwords are not allowed. You must generate a dedicated **16-character App Password** in Google Account settings.
- If using Amazon SES: Verify that your domain or email address is out of the SES sandbox, or verify recipient email addresses in the AWS SES Console.

---

## 7. Python 3.15 Template Context Copy Compatibility

**Error**: `AttributeError: 'super' object has no attribute 'dicts'`
**Root Cause**: Python 3.15 changed `copy.copy(super())` behavior, affecting Django 5.1 template context rendering during test instrumentation.
**Resolution**:
Verify that `django_server/core/settings.py` includes the explicit copy monkey-patch:
```python
import copy
import django.template.context as _dtc

def _safe_base_context_copy(self):
    obj = self.__class__.__new__(self.__class__)
    obj.dicts = self.dicts[:]
    return obj

def _safe_context_copy(self):
    obj = self.__class__.__new__(self.__class__)
    obj.dicts = self.dicts[:]
    obj.render_context = copy.copy(self.render_context)
    return obj

_dtc.BaseContext.__copy__ = _safe_base_context_copy
_dtc.Context.__copy__ = _safe_context_copy
```

