from django.test import TestCase
from rest_framework.test import APIClient
from apps.authentication.models import User
from apps.chat.models import Conversation, ConversationMember
from apps.messages_app.models import Message, DeletedMessageForUser
from apps.outbox.models import MessageOutbox


class ChatMessagesTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user1 = User.objects.create_user(email="user1@example.com", username="user1", name="User One")
        self.user2 = User.objects.create_user(email="user2@example.com", username="user2", name="User Two")
        self.client.force_authenticate(user=self.user1)

    def test_direct_chat_and_message_flow(self):
        # 1. Create direct chat
        resp = self.client.post("/api/v1/chat/direct", {"userId": str(self.user2.id)})
        self.assertEqual(resp.status_code, 200)
        chat_id = resp.data["chatId"]

        # 2. Send message with client_message_id (idempotency key)
        resp_msg = self.client.post("/api/v1/message/send", {
            "chatId": chat_id,
            "message": "Hello User Two!",
            "client_message_id": "client-uuid-001",
        })
        self.assertEqual(resp_msg.status_code, 201)
        msg_id = resp_msg.data["message"]["_id"]

        # 3. Verify message is stored in database and encrypted
        msg = Message.objects.get(id=msg_id)
        self.assertTrue(msg.content.startswith("ENC:"))
        self.assertEqual(msg.decrypted_content, "Hello User Two!")

        # 4. Verify Transactional Outbox record exists
        outbox_entry = MessageOutbox.objects.filter(event_type="message.created", conversation_id=chat_id).first()
        self.assertIsNotNone(outbox_entry)
        self.assertIn("user2@example.com", [self.user2.email])

        # 5. Idempotent re-send should return existing message without creating duplicate
        resp_dup = self.client.post("/api/v1/message/send", {
            "chatId": chat_id,
            "message": "Hello User Two!",
            "client_message_id": "client-uuid-001",
        })
        self.assertEqual(resp_dup.status_code, 200)
        self.assertEqual(Message.objects.filter(conversation_id=chat_id).count(), 1)

    def test_edit_and_delete_message(self):
        conv = Conversation.objects.create(type="direct", creator=self.user1)
        ConversationMember.objects.create(conversation=conv, user=self.user1)
        ConversationMember.objects.create(conversation=conv, user=self.user2)

        msg = Message.objects.create(
            conversation=conv,
            sender=self.user1,
            content="Original content"
        )

        # 1. Edit message
        resp_edit = self.client.patch(f"/api/v1/message/{msg.id}", {"content": "Updated content"})
        self.assertEqual(resp_edit.status_code, 200)
        msg.refresh_from_db()
        self.assertEqual(msg.decrypted_content, "Updated content")
        self.assertTrue(msg.is_edited)

        # 2. Delete for me
        resp_del_me = self.client.post(f"/api/v1/message/{msg.id}/delete-for-me")
        self.assertEqual(resp_del_me.status_code, 200)
        self.assertTrue(DeletedMessageForUser.objects.filter(user=self.user1, message=msg).exists())

        # 3. Delete for everyone
        resp_del_all = self.client.delete(f"/api/v1/message/delete/{msg.id}")
        self.assertEqual(resp_del_all.status_code, 200)
        msg.refresh_from_db()
        self.assertTrue(msg.is_deleted)
        self.assertEqual(msg.decrypted_content, "🚫 This message was deleted")

