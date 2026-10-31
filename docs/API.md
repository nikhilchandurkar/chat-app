# API Reference

Base URL: `http://localhost:8000` (dev) or `https://yourdomain.com` (prod)

All endpoints return a consistent JSON envelope:

```json
// Success
{ "success": true, "message": "...", "data": {} }

// Error
{ "success": false, "message": "...", "errors": { "field": ["..."] } }
```

Authentication: `Authorization: Bearer <jwt>` header **or** `chitChat-Token` cookie.

---

## Authentication – `/api/v1/auth/`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/new` | No | Register new user |
| POST | `/auth/login` | No | Login (returns JWT) |
| POST | `/auth/logout` | No | Clear auth cookie |
| POST | `/auth/otp` | No | Request OTP email |
| POST | `/auth/verify-otp` | No | Verify OTP → JWT |
| POST | `/auth/forgot-password` | No | Send reset link |
| POST | `/auth/reset-password` | No | Reset with token |

### POST `/auth/new`

```json
// Request
{
  "name": "Alice",
  "username": "alice",
  "email": "alice@example.com",
  "password": "SecurePass1!"
}

// 201 Response
{
  "success": true,
  "message": "User Created",
  "user": { "_id": "...", "name": "Alice", "username": "alice", "email": "...", "token": "..." }
}
```

### POST `/auth/login`

```json
// Request (username or email accepted)
{ "username": "alice", "password": "SecurePass1!" }

// 200 Response
{ "success": true, "message": "Welcome back, Alice!", "user": { ... }, "token": "..." }
```

---

## Users – `/api/v1/user/`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/user/me` | Yes | Get own profile |
| PUT | `/user/profile` | Yes | Update name / bio / avatar |
| DELETE | `/user/profile` | Yes | Delete account |
| PUT | `/user/change-password` | Yes | Change password |
| GET | `/user/search?name=` | Yes | Search users |
| PUT | `/user/send-request` | Yes | Send friend request |
| PUT | `/user/accept-request` | Yes | Accept/reject request |
| GET | `/user/notifications` | Yes | Pending friend requests |
| GET | `/user/friends` | Yes | Friends list |
| PUT | `/user/status` | Yes | Update online status |
| POST | `/user/star-message/:id` | Yes | Toggle starred message |
| GET | `/user/starred-messages` | Yes | Get starred messages |

---

## Chats – `/api/v1/chat/`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/chat/my` | Yes | List user's chats |
| GET | `/chat/my-groups` | Yes | List user's groups |
| POST | `/chat/new` | Yes | Create group chat |
| GET | `/chat/:id` | Yes | Chat details |
| PUT | `/chat/:id` | Yes | Update group (name/avatar) |
| DELETE | `/chat/:id` | Yes | Delete chat |
| GET | `/chat/:id/messages` | Yes | Paginated message history |
| PUT | `/chat/add-members` | Yes | Add members to group |
| PUT | `/chat/remove-member` | Yes | Remove member from group |
| DELETE | `/chat/:id/leave` | Yes | Leave group |
| PUT | `/chat/:id/restrict` | Yes | Toggle message restriction |
| POST | `/chat/add-admin` | Yes | Promote member to admin |
| POST | `/chat/remove-admin` | Yes | Demote admin |
| GET | `/chat/:id/pinned` | Yes | Get pinned messages |
| POST | `/chat/:chatId/pin/:msgId` | Yes | Pin message |
| DELETE | `/chat/:chatId/pin/:msgId` | Yes | Unpin message |
| POST | `/chat/send-attachments` | Yes | Send file attachments |

### GET `/chat/:id/messages`

Query parameters:
- `page` (integer, default: 1)

```json
// 200 Response
{
  "success": true,
  "messages": [
    {
      "_id": "uuid",
      "content": "Hello!",
      "sender": { "_id": "...", "name": "Alice", "avatar": "..." },
      "chat": "chat-uuid",
      "attachments": [],
      "isEdited": false,
      "isDeleted": false,
      "reactions": [],
      "replyTo": null,
      "readBy": ["uuid1"],
      "createdAt": "2026-10-31T12:00:00Z"
    }
  ],
  "totalPages": 5
}
```

---

## Messages – `/api/v1/message/`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| PATCH | `/message/:id` | Yes | Edit message content |
| DELETE | `/message/:id` | Yes | Soft-delete message |
| POST | `/message/:id/react` | Yes | Add/toggle reaction |
| POST | `/message/forward` | Yes | Forward message to chats |
| GET | `/message/search/:chatId?q=` | Yes | Search messages |
| GET | `/message/media/:chatId` | Yes | Get chat media attachments |

---

## Admin – `/api/v1/admin/`

Requires `chitChat-admin-token` cookie (set via `/api/v1/admin/verify`).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/verify` | Verify admin secret key |
| POST | `/admin/logout` | Clear admin cookie |
| GET | `/admin/users` | All users |
| GET | `/admin/chats` | All chats |
| GET | `/admin/messages` | Recent 100 messages |
| GET | `/admin/stats` | Dashboard stats |

---

## Link Preview – `/api/v1/preview`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/preview?url=` | Yes | Fetch OG metadata for URL |

---

## Error Codes

| HTTP | Meaning |
|------|---------|
| 400 | Validation failed / bad request |
| 401 | Authentication required or invalid |
| 403 | Authorised user lacks permission |
| 404 | Resource not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error (check logs) |
