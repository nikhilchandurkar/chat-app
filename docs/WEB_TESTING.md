# Web Application Testing & Verification Guide

## 1. Overview

The web client is built with **React 18**, **TypeScript**, **Vite**, **Tailwind CSS**, **Lucide Icons**, and **TanStack Query**. It delivers a high-performance, responsive single-page application (SPA) with zero external auth vendor lock-in.

---

## 2. Static Analysis & Build Verification

Before deploying, run the following verification checks:

```bash
cd client

# 1. Type Checking
npx tsc --noEmit

# 2. Production Vite Build
npm run build
```

The output in `client/dist/` should include:
- Minified, chunk-split JavaScript assets.
- Optimized CSS files.
- Static brand assets (`logo.svg`, `favicon.svg`).

---

## 3. Comprehensive Functional Testing Matrix

To perform end-to-end testing, open **two separate browser sessions** (e.g., standard Chrome window for User A, and Incognito Chrome or Firefox for User B).

### Test Case 1: Passwordless Email OTP Authentication
1. **User A**: Navigate to `http://localhost:5173/login`.
2. Enter `alice@example.com` and click **Send OTP**.
3. Retrieve OTP from terminal console or email inbox.
4. Submit OTP.
5. **Expected**: Authentication succeeds, JWT tokens are stored in secure storage / httpOnly cookies, and User A lands on the conversation dashboard (`/chat`).

### Test Case 2: Real-Time Messaging & Typing Indicators
1. **User A**: Create or open a direct chat with User B (`bob@example.com`).
2. **User B**: Log in as Bob in the second browser window.
3. **User A**: Begin typing in the message input field.
4. **Expected**: User B sees `"Alice is typing..."` above the input area within 100ms.
5. **User A**: Type `"Hello Bob!"` and press Enter.
6. **Expected**: Message appears instantly on User A's screen (optimistic update) and on User B's screen via WebSocket frame.
7. **Expected**: User B reads the message; double-blue checkmark appears on User A's screen indicating read status.

### Test Case 3: Private File Attachments & Streaming
1. **User A**: Click attachment icon in conversation with User B.
2. Select an image (`test.jpg`), PDF document, or audio file (< 100MB).
3. The client uploads the file via chunked or direct upload to `/api/v1/storage/upload/multipart/`.
4. The message displays with the media preview.
5. **User B**: Click to view or download the attachment.
6. **Expected**: File streams from `/api/v1/storage/stream/<attachment_id>/` with HTTP 206 partial range support.
7. **Security Check**: Open a third browser window as User C (`carol@example.com`). Paste the attachment URL.
8. **Expected**: Django returns **HTTP 403 Forbidden** (Zero BOLA/IDOR).

### Test Case 4: Disappearing Messages (Ephemeral Mode)
1. **User A**: In chat settings with User B, set **Disappearing Messages** to `30 seconds`.
2. Both participants see a system message: `"Disappearing messages set to 30 seconds"`.
3. User A sends a message: `"This message will self-destruct"`.
4. Wait 31 seconds. Refresh both browsers.
5. **Expected**: Message is completely absent from conversation history for both users.

### Test Case 5: 24-Hour Status Updates
1. **User A**: Navigate to the **Status** tab (`/status`).
2. Click **Create Status**, select an image and caption, and set privacy to `"everyone"`.
3. **User B**: Open Status tab. Alice's story circle appears with an unviewed border.
4. User B clicks Alice's status to view it.
5. **User A**: Check status viewers list.
6. **Expected**: Alice sees Bob's viewer record with timestamp.
7. **Security Check**: As User B, attempt to inspect the status viewers API endpoint (`GET /api/v1/status/<id>/viewers/`).
8. **Expected**: Django returns **HTTP 403 Forbidden**; only the author can inspect viewers.

### Test Case 6: Privacy Settings Enforcement
1. **User A**: Go to **Settings > Privacy**.
2. Enable **Hide from search** (`hide_from_search = True`).
3. Set **Who can see when you're online** to `"Nobody"`.
4. Set **Read receipts** to `Off`.
5. **User B**: Search for Alice's username in user directory.
6. **Expected**: Alice does not appear in search results.
7. **User B**: Open chat with Alice. Alice's online indicator remains offline. Read receipts remain single gray checkmarks.

### Test Case 7: Private Invitation Links
1. **User A**: In a group chat, click **Generate Invite Link**. Set expiry to `24 hours` and max uses to `5`.
2. Copy the generated URL (`https://chat.yourdomain.com/invite/<token>`).
3. **User B**: Paste URL in browser. Group metadata preview loads. Click **Join Group**.
4. **Expected**: User B is added to group members, and existing members receive a WebSocket notification.
5. **User A**: Click **Revoke Link**.
6. **User C**: Attempt to join using the revoked link.
7. **Expected**: Application displays `"Invitation link is expired or revoked"`.

---

## 4. Web Push Notification Testing (VAPID)

1. Ensure `VAPID_PUBLIC_KEY` is configured in `client/.env.local`.
2. In browser settings, permit notifications for `localhost` or your domain.
3. Register the service worker via client notification toggle.
4. Minimize User B's browser window.
5. User A sends a message to User B.
6. **Expected**: OS desktop notification appears for User B with conversation sender and preview text.

