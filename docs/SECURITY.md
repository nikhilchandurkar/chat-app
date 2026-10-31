# Security

## Authentication Model

- JWT access tokens (15-day lifetime) via `djangorestframework-simplejwt`
- Tokens delivered via:
  - `chitChat-Token` HttpOnly cookie (browser) – prevents XSS token theft
  - `Authorization: Bearer <token>` header (React Native / API clients)
- Passwords hashed with PBKDF2 (Django default) or BCrypt (for migrated accounts)
- Minimum password length: 8 characters

## Authorization Model

Every API endpoint that accesses chat/message data verifies:

1. The request is authenticated (valid JWT).
2. The authenticated user is a member of the requested chat.
3. For destructive operations (delete group, add admin): the user holds the required role.

WebSocket connections verify membership **on every `NEW_MESSAGE` event**, not just at connection time.

## SQL Injection Prevention

Django ORM is used for all database operations. User-controlled values are always
passed as parameterised query parameters — never concatenated into SQL strings.

`STRICT_TRANS_TABLES` mode is enabled for MySQL to prevent silent data truncation.

## CSRF

REST API endpoints use JWT header authentication and are therefore CSRF-exempt
for API clients. Django's CSRF middleware remains active for session-based routes
(admin panel).

## CORS

In development (`DEBUG=True`), all origins are allowed for convenience.  
In production (`DEBUG=False`), only origins listed in `CORS_ALLOWED_ORIGINS` (derived
from `CLIENT_URL` and `EXTRA_CORS_ORIGINS` env vars) are permitted.

## Rate Limiting

| Scope | Limit |
|-------|-------|
| Anonymous API requests | `API_RATE_LIMIT/min` (default 60) |
| Authenticated API requests | `API_RATE_LIMIT/min` |
| Login endpoint | `LOGIN_RATE_LIMIT/min` (default 5) |
| OTP request | `OTP_RATE_LIMIT/min` (default 3) |

Limits are configurable via `.env` without code changes.

Nginx adds an additional layer: `limit_req zone=api_limit` (10 req/s, burst 30).

## WebSocket Security

- Unauthenticated connections are immediately closed.
- Users cannot subscribe to another user's group channel.
- `chatId` membership is re-verified on every incoming message.
- Malformed JSON frames are discarded without exceptions.
- Unknown event types are silently ignored.
- Message content is AES-256-CBC encrypted at rest (see below).

## Message Encryption

All message content is encrypted with AES-256-CBC before storage and decrypted
on read. The encryption key is 32 bytes, loaded from `MESSAGE_ENCRYPTION_KEY` env var.

The format stored in the database:

```
ENC:<iv_hex>:<ciphertext_hex>
```

**Important:** This is field-level encryption for data at rest. It does not replace
TLS for data in transit. Use HTTPS/WSS in production.

## File Upload Security

- Maximum 5 files per message, served from a controlled media directory.
- File names are server-generated (not user-provided).
- Uploads served via Django's `send_file` (no direct execution).

## Production Deployment Checklist

1. `DEBUG=False`
2. `SECRET_KEY` set to a strong random 50-character string
3. `ALLOWED_HOSTS` set to your domain/IP (not `*`)
4. `CLIENT_URL` set to your frontend origin
5. `MESSAGE_ENCRYPTION_KEY` set to a unique 32-character key
6. `ADMIN_SECRET_KEY` set to a strong unique value
7. Database credentials are least-privilege (not the MySQL root account)
8. `FORCE_SSL_REDIRECT=True` if Nginx handles TLS termination and sets `X-Forwarded-Proto`
9. Redis password configured if Redis is publicly accessible
10. Review Bandit scan results (`bandit-report.json` in CI artifacts)
11. Review Trivy container scan in GitHub Security tab

## Environment Variable Handling

- Never commit `.env` to version control (`.gitignore` excludes it)
- `.env.example` contains placeholder values only
- CI/CD uses GitHub Actions secrets (see `deploy.yml`)
- The application never logs or exposes environment variable values to clients

## Error Responses

API errors never include:
- Stack traces
- Database error details
- Internal file paths
- Secret key values

All unexpected server errors return:
```json
{ "success": false, "message": "An unexpected error occurred. Please try again." }
```

And are logged internally with full context for debugging.
