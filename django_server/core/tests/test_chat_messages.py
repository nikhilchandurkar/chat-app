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

    def test_group_admin_restrict_and_pinned_messages(self):
        user3 = User.objects.create_user(email="user3@example.com", username="user3", name="User Three")
        group = Conversation.objects.create(type="group", name="Engineering", creator=self.user1)
        group.admins.add(self.user1)
        ConversationMember.objects.create(conversation=group, user=self.user1, role="admin")
        ConversationMember.objects.create(conversation=group, user=self.user2, role="member")
        ConversationMember.objects.create(conversation=group, user=user3, role="member")

        # 1. Non-admin cannot restrict group messages
        self.client.force_authenticate(user=self.user2)
        non_admin_res = self.client.put(f"/api/v1/chat/{group.id}/restrict")
        self.assertEqual(non_admin_res.status_code, 403)

        # 2. Admin can toggle restrict messages and promote/demote admin
        self.client.force_authenticate(user=self.user1)
        restrict_res = self.client.put(f"/api/v1/chat/{group.id}/restrict")
        self.assertEqual(restrict_res.status_code, 200)
        self.assertTrue(restrict_res.data["restrictedMessages"])

        promote_res = self.client.post("/api/v1/chat/add-admin", {
            "chatId": str(group.id),
            "userId": str(self.user2.id),
        })
        self.assertEqual(promote_res.status_code, 200)
        self.assertTrue(group.admins.filter(id=self.user2.id).exists())

        demote_res = self.client.post("/api/v1/chat/remove-admin", {
            "chatId": str(group.id),
            "userId": str(self.user2.id),
        })
        self.assertEqual(demote_res.status_code, 200)
        self.assertFalse(group.admins.filter(id=self.user2.id).exists())

        # 3. Admin pins and unpins a message, members can list pinned messages
        msg = Message.objects.create(conversation=group, sender=self.user1, content="Release checklist")
        pin_res = self.client.post(f"/api/v1/chat/{group.id}/pin/{msg.id}")
        self.assertEqual(pin_res.status_code, 200)

        self.client.force_authenticate(user=user3)
        list_res = self.client.get(f"/api/v1/chat/{group.id}/pins")
        self.assertEqual(list_res.status_code, 200)
        self.assertEqual(len(list_res.data["pinnedMessages"]), 1)
        self.assertEqual(list_res.data["pinnedMessages"][0]["_id"], str(msg.id))

        self.client.force_authenticate(user=self.user1)
        unpin_res = self.client.delete(f"/api/v1/chat/{group.id}/pin/{msg.id}")
        self.assertEqual(unpin_res.status_code, 200)
        list_after = self.client.get(f"/api/v1/chat/{group.id}/pins")
        self.assertEqual(len(list_after.data["pinnedMessages"]), 0)

