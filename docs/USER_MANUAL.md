# User Manual

## Creating an Account

1. Open the application in your browser (default: `http://localhost:5173`).
2. You will be redirected to the **Login** page.
3. Click **Register** or navigate to the registration form.
4. Fill in:
   - **Name** – your display name
   - **Username** – a unique handle (lowercase, no spaces)
   - **Email** – a valid email address
   - **Password** – at least 8 characters
5. Click **Create Account**.
6. You are automatically logged in after registration.

---

## Logging In

**Option 1 – Username/Password:**

1. Enter your username (or email) in the first field.
2. Enter your password.
3. Click **Login**.

**Option 2 – OTP (Email):**

1. Click **Login with OTP**.
2. Enter your email address.
3. Click **Send Code**.
4. Check your email for a 6-digit code (expires in 5 minutes).
5. Enter the code and click **Verify**.

---

## Resetting Your Password

1. On the login page, click **Forgot Password?**.
2. Enter your email address and click **Send Reset Link**.
3. Check your email for a password reset link (expires in 1 hour).
4. Click the link, enter your new password, and click **Reset Password**.

*Note: For security reasons, the system does not reveal whether an email address is registered.*

---

## Finding and Adding Friends

1. Click the **Search** icon or use the search bar.
2. Type the name of the person you want to add.
3. Click **Send Friend Request** next to their profile.
4. Once they accept, a direct chat with them appears in your chat list.

---

## Using Conversations

### Opening a Chat

Click on any name in the left sidebar to open that conversation.

### Sending a Message

1. Click inside the message input at the bottom.
2. Type your message.
3. Press **Enter** or click the **Send** button.

### Replying to a Message

1. Hover over a message.
2. Click the **Reply** icon.
3. Your message input will show a reply preview.
4. Type your reply and send.

### Adding a Reaction

1. Hover over a message.
2. Click the **Emoji** icon.
3. Pick a reaction emoji.

### Editing a Message

You can edit a message you sent:

1. Hover over your message.
2. Click the **Edit** (pencil) icon.
3. Modify the text and press **Enter** or click the save icon.

*Edited messages show an "Edited" label.*

### Deleting a Message

1. Hover over your message.
2. Click the **Delete** (trash) icon.
3. Confirm the deletion.

*Deleted messages show "This message was deleted."*

---

## Group Chats

### Creating a Group

1. Click the **New Group** button or the group icon.
2. Enter a group name.
3. Search for and add at least 2 friends.
4. Click **Create**.

### Managing a Group (Admins Only)

- **Add members** – click the group info icon → Add Members.
- **Remove members** – click the member → Remove.
- **Rename group** – click Edit in the group info panel.
- **Restrict messages** – toggle "Only admins can send messages".

### Leaving a Group

Open the group, click the info icon, and click **Leave Group**.

---

## File Attachments

1. Click the **Attach** (paperclip) icon in the message bar.
2. Select up to 5 files.
3. Click **Send**.

Accepted file types depend on your server configuration.

---

## Online Status

Your status dot indicates availability:

| Colour | Status |
|--------|--------|
| Green | Online |
| Yellow | Away |
| Orange | Busy |
| Red | Do Not Disturb |

Change your status from your profile menu.

---

## Starred Messages

1. Hover over any message.
2. Click the **Star** icon to bookmark it.
3. View starred messages via your profile → Starred Messages.

---

## Pinned Messages

Group admins can pin up to 3 important messages:

1. Hover over the message.
2. Click the **Pin** icon.
3. Pinned messages appear at the top of the chat.

---

## Basic Troubleshooting

| Problem | Solution |
|---------|----------|
| Can't log in | Check username/email and password. Use Forgot Password if needed. |
| Messages not delivering | Check your internet connection. The connection status indicator in the chat shows if the WebSocket is connected. |
| OTP code not received | Check your spam folder. Request a new code after 5 minutes. |
| Chat list is empty | You need to have accepted friend requests before chats appear. |
| Page looks broken | Try a hard refresh (Ctrl+Shift+R / Cmd+Shift+R). |
| Application won't load | Ensure the backend server is running on port 8000. |
