"""Tests for E2EE public key exchange, interactive polls, read receipts, and status feed."""

from rest_framework import status
from rest_framework.test import APITestCase

from apps.authentication.models import User
from apps.chat.models import Conversation, ConversationMember
from apps.messages_app.models import Message, MessageReceipt
from apps.status_app.models import UserStatus


class RichFeaturesTestCase(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            email="alice_rich@example.com",
            username="alice_rich",
            password="StrongPassword123!",
            name="Alice Rich",
        )
        self.bob = User.objects.create_user(
            email="bob_rich@example.com",
            username="bob_rich",
            password="StrongPassword123!",
            name="Bob Rich",
        )
        self.conv = Conversation.objects.create(name="Rich Room", type="group", group_chat=True, creator=self.alice)
        ConversationMember.objects.create(conversation=self.conv, user=self.alice, role="owner")
        ConversationMember.objects.create(conversation=self.conv, user=self.bob, role="member")

        login = self.client.post(
            "/api/v1/auth/login",
            {"username": self.alice.username, "password": "StrongPassword123!", "device_id": "web-1"},
            format="json",
        )
        self.alice_token = login.data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.alice_token}")

    def test_e2ee_public_key_publish_and_reject_private_d(self):
        bad = self.client.put(
            "/api/v1/user/e2ee/key",
            {"publicKey": {"kty": "EC", "crv": "P-256", "x": "abc", "y": "def", "d": "secret"}},
            format="json",
        )
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)

        good = self.client.put(
            "/api/v1/user/e2ee/key",
            {
                "publicKey": {"kty": "EC", "crv": "P-256", "x": "x-val", "y": "y-val"},
                "fingerprint": "SHA256:AABB",
            },
            format="json",
        )
        self.assertEqual(good.status_code, status.HTTP_200_OK)
        self.assertEqual(good.data["fingerprint"], "SHA256:AABB")

        fetch = self.client.get(f"/api/v1/user/e2ee/key/{self.alice.id}")
        self.assertEqual(fetch.status_code, status.HTTP_200_OK)
        self.assertEqual(fetch.data["publicKey"]["x"], "x-val")

    def test_create_and_vote_poll(self):
        created = self.client.post(
            "/api/v1/message/poll/create",
            {"chatId": str(self.conv.id), "question": "Lunch?", "options": ["Pizza", "Tacos"], "allowMultiple": False},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        msg_id = created.data["message"]["_id"]

        vote1 = self.client.post(f"/api/v1/message/poll/{msg_id}/vote", {"optionId": "1"}, format="json")
        self.assertEqual(vote1.status_code, status.HTTP_200_OK)
        opts = vote1.data["attachments"][0]["options"]
        self.assertIn(str(self.alice.id), opts[0]["votes"])

        # Voting option 2 replaces vote 1 when allowMultiple is False
        vote2 = self.client.post(f"/api/v1/message/poll/{msg_id}/vote", {"optionId": "2"}, format="json")
        opts2 = vote2.data["attachments"][0]["options"]
        self.assertNotIn(str(self.alice.id), opts2[0]["votes"])
        self.assertIn(str(self.alice.id), opts2[1]["votes"])

    def test_message_receipts_and_delete_for_me(self):
        msg = Message.objects.create(conversation=self.conv, sender=self.alice, content="Hello group")
        MessageReceipt.objects.create(message=msg, user=self.bob, status="read")
        res = self.client.get(f"/api/v1/message/{msg.id}/receipts")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["receipts"]), 1)
        self.assertEqual(res.data["receipts"][0]["username"], "bob_rich")

        del_me = self.client.post(f"/api/v1/message/{msg.id}/delete-for-me")
        self.assertEqual(del_me.status_code, status.HTTP_200_OK)

    def test_direct_friend_can_view_contacts_only_status(self):
        dm = Conversation.objects.create(type="direct", creator=self.alice)
        ConversationMember.objects.create(conversation=dm, user=self.alice, role="member")
        ConversationMember.objects.create(conversation=dm, user=self.bob, role="member")
        UserStatus.objects.create(user=self.bob, status_type="text", content="Sunny day!", privacy="contacts")

        feed = self.client.get("/api/v1/status/feed")
        self.assertEqual(feed.status_code, status.HTTP_200_OK)
        self.assertEqual(len(feed.data["feed"]), 1)
        self.assertEqual(feed.data["feed"][0]["statuses"][0]["content"], "Sunny day!")

    def test_preview_link_blocks_private_ssrf_targets(self):
        for bad_url in [
            "http://127.0.0.1:8000/admin",
            "http://169.254.169.254/latest/meta-data/",
            "http://localhost/health",
            "file:///etc/passwd",
        ]:
            res = self.client.get("/api/v1/preview/", {"url": bad_url})
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, bad_url)

