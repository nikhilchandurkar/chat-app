# Complete REST and WebSocket API Specification

## 1. Authentication & Base URL

- **Production Base URL**: `https://chat.yourdomain.com`
- **Development Base URL**: `http://localhost:8000`
- **WebSocket URL**: `wss://chat.yourdomain.com/ws/chat/?token=<access_token>`

All authenticated REST endpoints require the HTTP Authorization header:
```http
Authorization: Bearer <jwt_access_token>
```

---

## 2. Authentication & User Profile Endpoints

### 2.1 Request Passwordless Email OTP
- **Endpoint**: `POST /api/v1/auth/otp/request/`
- **Rate Limit**: 6 requests / minute
- **Request Body**:
  ```json
  { "email": "user@example.com" }
  ```
- **Response (200 OK)**:
  ```json
  { "detail": "OTP sent successfully to user@example.com" }
  ```

### 2.2 Verify OTP and Authenticate
- **Endpoint**: `POST /api/v1/auth/otp/verify/`
- **Rate Limit**: 10 requests / minute
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "otp": "123456"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "access": "eyJhbGciOi...",
    "refresh": "eyJhbGciOi...",
    "user": {
      "id": "u-45189",
      "email": "user@example.com",
      "username": "user_45189",
      "display_name": "user_45189",
      "avatar_url": null
    }
  }
  ```

### 2.3 OAuth Verification
- **Endpoint**: `POST /api/v1/auth/oauth/verify/`
- **Request Body**:
  ```json
  {
    "provider": "google",
    "code": "4/0AeanS0...",
    "redirect_uri": "https://chat.yourdomain.com/auth/callback/google"
  }
  ```

### 2.4 Update Privacy Settings
- **Endpoint**: `PATCH /api/v1/auth/privacy/`
- **Request Body**:
  ```json
  {
    "hide_from_search": true,
    "privacy_online": "nobody",
    "privacy_read_receipts": false,
    "privacy_typing_indicator": false
  }
  ```

### 2.5 User Directory Search
- **Endpoint**: `GET /api/v1/auth/users/search/?q=alex`
- **Response (200 OK)**:
  ```json
  [
    {
      "id": "u-1234",
      "username": "alex_smith",
      "display_name": "Alex Smith",
      "avatar_url": "https://..."
    }
  ]
  ```
  *(Omits any user with `hide_from_search=True`)*

---

## 3. Conversations & Invitation Links

### 3.1 List Conversations
- **Endpoint**: `GET /api/v1/chat/conversations/`
- **Response (200 OK)**:
  ```json
  [
    {
      "id": "c-9871",
      "is_group": false,
      "ephemeral_ttl": 0,
      "other_participant": {
        "id": "u-5678",
        "username": "bob",
        "display_name": "Bob Vance"
      },
      "last_message": {
        "id": "m-102",
        "content": "Hey there!",
        "created_at": "2026-11-08T12:00:00Z"
      }
    }
  ]
  ```

### 3.2 Update Disappearing Messages TTL
- **Endpoint**: `POST /api/v1/chat/conversations/<conversation_id>/ephemeral/`
- **Request Body**:
  ```json
  { "ephemeral_ttl": 3600 }
  ```
  *(Supported TTLs: 0, 30, 60, 3600, 86400, 604800)*

### 3.3 Generate Invitation Link
- **Endpoint**: `POST /api/v1/chat/invite/generate/`
- **Request Body**:
  ```json
  {
    "conversation_id": "c-9871",
    "expires_in_hours": 24,
    "max_uses": 10
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "invite_url": "https://chat.yourdomain.com/invite/8f9a2b...",
    "token": "8f9a2b...",
    "expires_at": "2026-11-09T12:00:00Z"
  }
  ```

---

## 4. Messages & Reactions

### 4.1 Send Message
- **Endpoint**: `POST /api/v1/message/send/`
- **Request Body**:
  ```json
  {
    "conversation_id": "c-9871",
    "content": "Hello, how are you?",
    "attachment_ids": ["att-491"]
  }
  ```

### 4.2 Fetch Conversation Messages
- **Endpoint**: `GET /api/v1/message/chat/<chat_id>/?page=1&limit=50`
- **Authorization**: Must be conversation member.
- **Filter**: Expired disappearing messages are automatically excluded.

### 4.3 React to Message
- **Endpoint**: `POST /api/v1/message/react/`
- **Request Body**:
  ```json
  {
    "message_id": "m-102",
    "emoji": "👍"
  }
  ```

### 4.4 Forward Message
- **Endpoint**: `POST /api/v1/message/forward/`
- **Request Body**:
  ```json
  {
    "message_id": "m-102",
    "target_conversation_id": "c-4421"
  }
  ```
  *(Fails with 403 if user is not a member of both source and target conversations)*

---

## 5. Private File Storage & Streaming

### 5.1 Direct Multipart Upload
- **Endpoint**: `POST /api/v1/storage/upload/multipart/`
- **Content-Type**: `multipart/form-data`
- **Payload**: Form field `file`
- **Validation**: Rejects disguised executables, PE headers, ELF headers, script signatures.

### 5.2 Authenticated Stream & Download
- **Endpoint**: `GET /api/v1/storage/stream/<attachment_id>/`
- **Authorization**: User must be an active member of the conversation housing the attachment. Expired attachments return 404.
- **Features**: Supports HTTP 206 `Range: bytes=0-1048575` for video/audio streaming.

---

## 6. User Status / Stories

### 6.1 Create Status
- **Endpoint**: `POST /api/v1/status/create/`
- **Content-Type**: `multipart/form-data`
- **Parameters**: `status_type` (`"text"`, `"image"`, `"video"`), `content`, `media_file`, `privacy` (`"everyone"`, `"contacts"`, `"nobody"`).

### 6.2 Status Feed
- **Endpoint**: `GET /api/v1/status/feed/`
- **Response**: List of active statuses published in the last 24 hours.

### 6.3 Status Viewers
- **Endpoint**: `GET /api/v1/status/<status_id>/viewers/`
- **Authorization**: Accessible strictly by the status author. Others receive HTTP 403.

---

## 7. Real-Time WebSocket Protocol (`/ws/chat/`)

### Inbound Frames (Client -> Server)

**1. Typing Start**:
```json
{
  "type": "typing.start",
  "conversation_id": "c-9871"
}
```

**2. Typing Stop**:
```json
{
  "type": "typing.stop",
  "conversation_id": "c-9871"
}
```

**3. Message Read Marker**:
```json
{
  "type": "message.read",
  "conversation_id": "c-9871",
  "message_id": "m-102"
}
```

### Outbound Frames (Server -> Client)

**1. New Message**:
```json
{
  "type": "message.new",
  "data": {
    "id": "m-103",
    "conversation_id": "c-9871",
    "sender": { "id": "u-5678", "username": "bob" },
    "content": "Sounds good!",
    "created_at": "2026-11-08T12:05:00Z"
  }
}
```

**2. User Presence**:
```json
{
  "type": "presence.update",
  "data": {
    "user_id": "u-5678",
    "status": "online"
  }
}
```

