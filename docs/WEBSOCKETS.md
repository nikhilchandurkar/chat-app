# WebSocket Protocol

## Connection

**URL:** `ws://localhost:8000/ws` (dev) or `wss://yourdomain.com/ws` (prod)

**Authentication** – pass the JWT token one of three ways:

1. Query parameter (recommended for browser): `?token=<jwt>`
2. Cookie: `chitChat-Token=<jwt>`
3. Header (React Native): `Authorization: Bearer <jwt>`

If no valid token is provided, the connection is closed immediately.

---

## Message Format

Every message in both directions follows this structure:

```json
{
  "event": "<EVENT_NAME>",
  "data": { ... }
}
```

---

## Client → Server Events

### `NEW_MESSAGE`

Send a new text message to a chat.

```json
{
  "event": "NEW_MESSAGE",
  "data": {
    "chatId": "uuid",
    "message": "Hello!",
    "members": ["user-uuid-1", "user-uuid-2"],
    "replyTo": null
  }
}
```

The server validates that the authenticated user is a member of `chatId` before persisting.

---

### `START_TYPING`

Notify other members that the user has started typing.

```json
{
  "event": "START_TYPING",
  "data": {
    "chatId": "uuid",
    "members": ["other-user-uuid"]
  }
}
```

---

### `STOP_TYPING`

```json
{
  "event": "STOP_TYPING",
  "data": {
    "chatId": "uuid",
    "members": ["other-user-uuid"]
  }
}
```

---

### `MESSAGE_READ`

Mark messages as read by the authenticated user.

```json
{
  "event": "MESSAGE_READ",
  "data": {
    "chatId": "uuid",
    "messageIds": ["msg-uuid-1", "msg-uuid-2"],
    "members": ["other-user-uuid"]
  }
}
```

---

## Server → Client Events

### `connection.ready` / `ONLINE_USERS`

Sent immediately after a successful connection.

```json
{
  "event": "ONLINE_USERS",
  "data": ["user-uuid-1", "user-uuid-2"]
}
```

---

### `NEW_MESSAGE`

Delivered to all chat members when a message is saved.

```json
{
  "event": "NEW_MESSAGE",
  "data": {
    "chatId": "uuid",
    "message": {
      "_id": "msg-uuid",
      "content": "Hello!",
      "sender": { "_id": "...", "name": "Alice", "avatar": "..." },
      "chat": "chat-uuid",
      "attachments": [],
      "isEdited": false,
      "isDeleted": false,
      "reactions": [],
      "replyTo": null,
      "readBy": ["sender-uuid"],
      "createdAt": "2026-10-31T12:00:00Z"
    }
  }
}
```

---

### `NEW_MESSAGE_ALERT`

Lightweight unread indicator sent to non-sender members.

```json
{ "event": "NEW_MESSAGE_ALERT", "data": { "chatId": "uuid" } }
```

---

### `START_TYPING` / `STOP_TYPING`

```json
{ "event": "START_TYPING", "data": { "chatId": "uuid" } }
{ "event": "STOP_TYPING",  "data": { "chatId": "uuid" } }
```

---

### `MESSAGE_READ_UPDATE`

```json
{
  "event": "MESSAGE_READ_UPDATE",
  "data": {
    "chatId": "uuid",
    "messageIds": ["msg-uuid"],
    "readBy": "user-uuid"
  }
}
```

---

### `MESSAGE_EDITED`

```json
{
  "event": "MESSAGE_EDITED",
  "data": {
    "messageId": "uuid",
    "chatId": "uuid",
    "content": "Updated content",
    "isEdited": true
  }
}
```

---

### `MESSAGE_DELETED`

```json
{
  "event": "MESSAGE_DELETED",
  "data": { "messageId": "uuid", "chatId": "uuid" }
}
```

---

### `MESSAGE_REACTED`

```json
{
  "event": "MESSAGE_REACTED",
  "data": {
    "messageId": "uuid",
    "chatId": "uuid",
    "reactions": [{ "user": { "_id": "...", "name": "..." }, "emoji": "👍" }]
  }
}
```

---

### `REFETCH_CHATS`

Instructs the client to reload the chat list (e.g., after a group is updated).

```json
{ "event": "REFETCH_CHATS", "data": {} }
```

---

### `ALERT`

General-purpose notification message.

```json
{ "event": "ALERT", "data": "Welcome to My Group!" }
```

---

## Security

- Connections without a valid JWT are closed immediately.
- The server independently verifies chat membership for every `NEW_MESSAGE` event.
- Clients must not supply their own user identity in payloads — the server derives it from the authenticated token.
- Unknown events are silently ignored.
- Malformed (non-JSON) frames are discarded without crashing.
- Message payload sizes are bounded by Django's `DATA_UPLOAD_MAX_MEMORY_SIZE`.

---

## Android / React Native

Connect using the same WebSocket URL with the token as a query parameter:

```typescript
const token = await AsyncStorage.getItem('jwt_token');
const ws = new WebSocket(`wss://yourdomain.com/ws?token=${token}`);
```

See `docs/MOBILE_SETUP.md` for full setup instructions.
