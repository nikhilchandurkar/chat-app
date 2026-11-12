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

    def test_upload_image_story_returns_valid_media_url(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from apps.storage_app.services.file_validator import validate_file_header

        jfif_bytes = b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
        ok, err_msg = validate_file_header(jfif_bytes, "photo.jfif")
        self.assertTrue(ok, err_msg)

        png_bytes = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00"
            b"\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        upload = SimpleUploadedFile("story.png", png_bytes, content_type="image/png")
        res = self.client.post(
            "/api/v1/status/",
            {"status_type": "image", "content": "My photo", "privacy": "everyone", "media": upload},
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data["status"]["media_url"].startswith("/api/v1/media/statuses/"))

    def test_cross_device_sync_outbox_events(self):
        from apps.outbox.models import MessageOutbox

        msg = Message.objects.create(conversation=self.conv, sender=self.alice, content="Initial")
        edit_res = self.client.patch(f"/api/v1/message/{msg.id}", {"content": "Updated"}, format="json")
        self.assertEqual(edit_res.status_code, status.HTTP_200_OK)
        edited_evt = MessageOutbox.objects.filter(event_type="message.updated").latest("created_at")
        self.assertEqual(edited_evt.payload.get("legacy_event"), "MESSAGE_EDITED")
        self.assertEqual(edited_evt.payload.get("messageId"), str(msg.id))

        del_me_res = self.client.post(f"/api/v1/message/{msg.id}/delete-for-me")
        self.assertEqual(del_me_res.status_code, status.HTTP_200_OK)
        del_me_evt = MessageOutbox.objects.filter(event_type="message.deleted_for_me").latest("created_at")
        self.assertEqual(del_me_evt.payload.get("recipient_ids"), [str(self.alice.id)])

        pin_res = self.client.post(f"/api/v1/chat/pin/{self.conv.id}")
        self.assertEqual(pin_res.status_code, status.HTTP_200_OK)
        pin_evt = MessageOutbox.objects.filter(event_type="chat.member_updated").latest("created_at")
        self.assertEqual(pin_evt.payload.get("legacy_event"), "REFETCH_CHATS")

    def test_minigame_create_and_moves_flow(self):
        create_res = self.client.post(
            "/api/v1/message/interactive/game/create",
            {"chatId": str(self.conv.id), "gameType": "rps"},
            format="json",
        )
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        msg_id = create_res.data["message"]["_id"]

        r1 = self.client.post(f"/api/v1/message/interactive/game/{msg_id}/move", {"choice": "rock"}, format="json")
        self.assertEqual(r1.status_code, status.HTTP_200_OK)
        self.assertEqual(r1.data["attachments"][0]["status"], "active")

        self.client.force_authenticate(user=self.bob)
        r2 = self.client.post(f"/api/v1/message/interactive/game/{msg_id}/move", {"choice": "scissors"}, format="json")
        self.assertEqual(r2.status_code, status.HTTP_200_OK)
        self.assertEqual(r2.data["attachments"][0]["status"], "finished")
        self.assertEqual(r2.data["attachments"][0]["winnerId"], str(self.alice.id))

    def test_view_once_media_consumes_and_redacts(self):
        msg = Message.objects.create(
            conversation=self.conv,
            sender=self.alice,
            message_type="image",
            view_once=True,
            attachments=[{"type": "image", "url": "/api/v1/media/secret.png", "name": "secret.png"}],
        )
        self.client.force_authenticate(user=self.bob)
        open_res = self.client.post(f"/api/v1/message/{msg.id}/view-once")
        self.assertEqual(open_res.status_code, status.HTTP_200_OK)
        self.assertEqual(open_res.data["attachments"][0]["url"], "/api/v1/media/secret.png")

        second_res = self.client.post(f"/api/v1/message/{msg.id}/view-once")
        self.assertEqual(second_res.status_code, status.HTTP_410_GONE)

        feed_res = self.client.get(f"/api/v1/message/chat/{self.conv.id}")
        self.assertEqual(feed_res.status_code, status.HTTP_200_OK)
        found = next(m for m in feed_res.data["messages"] if m["_id"] == str(msg.id))
        self.assertTrue(found["attachments"][0].get("expiredForViewer"))
        self.assertEqual(found["attachments"][0].get("url"), "")

    def test_topics_threads_schedule_and_live_location(self):
        from datetime import timedelta
        from django.utils import timezone

        topic_res = self.client.post(
            f"/api/v1/chat/{self.conv.id}/topics",
            {"topic": "#announcements", "action": "add"},
            format="json",
        )
        self.assertEqual(topic_res.status_code, status.HTTP_200_OK)
        self.assertIn("announcements", topic_res.data["topics"])

        root = Message.objects.create(
            conversation=self.conv,
            sender=self.alice,
            content="Main topic post",
            topic_name="announcements",
        )
        Message.objects.create(
            conversation=self.conv,
            sender=self.bob,
            content="Thread reply",
            thread_root_id=root.id,
        )
        feed = self.client.get(f"/api/v1/message/chat/{self.conv.id}?topic=announcements")
        self.assertEqual(feed.status_code, status.HTTP_200_OK)
        self.assertEqual(len(feed.data["messages"]), 1)
        self.assertEqual(feed.data["messages"][0]["replyCount"], 1)

        thread_res = self.client.get(f"/api/v1/message/thread/{root.id}")
        self.assertEqual(thread_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(thread_res.data["replies"]), 1)

        due_time = (timezone.now() - timedelta(minutes=1)).isoformat()
        sched_res = self.client.post(
            "/api/v1/message/schedule",
            {"chatId": str(self.conv.id), "content": "Reminder ping", "scheduledFor": due_time},
            format="json",
        )
        self.assertEqual(sched_res.status_code, status.HTTP_201_CREATED)

        loc_res = self.client.post(
            "/api/v1/message/interactive/location/share",
            {"chatId": str(self.conv.id), "lat": 19.076, "lng": 72.8777, "durationMinutes": 15},
            format="json",
        )
        self.assertEqual(loc_res.status_code, status.HTTP_201_CREATED)
        loc_id = loc_res.data["message"]["_id"]
        upd = self.client.post(
            f"/api/v1/message/interactive/location/{loc_id}/update",
            {"stop": True},
            format="json",
        )
        self.assertEqual(upd.status_code, status.HTTP_200_OK)
        self.assertFalse(upd.data["attachments"][0]["active"])



