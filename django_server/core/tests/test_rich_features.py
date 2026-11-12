"""Tests for E2EE public key exchange, interactive polls, read receipts, and status feed."""

from rest_framework import status
from rest_framework.test import APITestCase

from apps.authentication.models import Request, User
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

    def test_ephemeral_after_seen_quiz_and_status_reactions(self):
        from datetime import timedelta
        from unittest.mock import patch
        from django.utils import timezone

        # 1. Disappearing 2 minutes after seen (-120)
        ttl_res = self.client.post(f"/api/v1/chat/{self.conv.id}/ephemeral", {"ephemeral_ttl": -120}, format="json")
        self.assertEqual(ttl_res.status_code, status.HTTP_200_OK)

        msg = Message.objects.create(conversation=self.conv, sender=self.alice, content="Secret after seen")
        self.assertIsNone(msg.expires_at)

        self.client.force_authenticate(user=self.bob)
        get_res = self.client.get(f"/api/v1/message/chat/{self.conv.id}")
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        msg.refresh_from_db()
        self.assertIsNotNone(msg.expires_at)
        diff = (msg.expires_at - timezone.now()).total_seconds()
        self.assertGreater(diff, 90)
        self.assertLessEqual(diff, 125)

        # 2. Dynamic multi-round Quiz Battle + additional mini-games
        with patch("apps.messages_app.interactive.requests.get", side_effect=OSError("offline test")):
            q_res = self.client.post(
                "/api/v1/message/interactive/game/create",
                {"chatId": str(self.conv.id), "gameType": "trivia", "difficulty": "medium"},
                format="json",
            )
        self.assertEqual(q_res.status_code, status.HTTP_201_CREATED)
        q_msg_id = q_res.data["message"]["_id"]
        q_att = q_res.data["message"]["attachments"][0]
        self.assertEqual(len(q_att["questions"]), 5)

        ans_res = self.client.post(f"/api/v1/message/interactive/game/{q_msg_id}/move", {"optionIndex": 0}, format="json")
        self.assertEqual(ans_res.status_code, status.HTTP_200_OK)
        nxt_res = self.client.post(f"/api/v1/message/interactive/game/{q_msg_id}/move", {"action": "next_question"}, format="json")
        self.assertEqual(nxt_res.status_code, status.HTTP_200_OK)
        self.assertEqual(nxt_res.data["attachments"][0]["currentIndex"], 1)

        # Verify extended mini-games create cleanly
        for gtype in ["diceduel", "coinflip", "highlow", "memory", "dotsboxes", "reversi", "mines", "blackjack", "evenodd", "oddone", "mathsprint"]:
            gres = self.client.post("/api/v1/message/interactive/game/create", {"chatId": str(self.conv.id), "gameType": gtype}, format="json")
            self.assertEqual(gres.status_code, status.HTTP_201_CREATED, gtype)

        # 3. Status reactions visible in GetStatusViewersView
        st = UserStatus.objects.create(user=self.alice, status_type="text", content="Check my reactions", privacy="everyone")
        react_res = self.client.post(f"/api/v1/status/{st.id}/react", {"reaction": "🔥"}, format="json")
        self.assertEqual(react_res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(react_res.data["reactions"]), 1)

        self.client.force_authenticate(user=self.alice)
        viewers_res = self.client.get(f"/api/v1/status/{st.id}/viewers")
        self.assertEqual(viewers_res.status_code, status.HTTP_200_OK)
        self.assertEqual(viewers_res.data["totalReactions"], 1)
        self.assertEqual(viewers_res.data["reactions"][0]["reaction"], "🔥")

    def test_clear_chat_per_user_dm_delete_and_fuzzy_search(self):
        dm = Conversation.objects.create(type="direct", creator=self.alice)
        ConversationMember.objects.create(conversation=dm, user=self.alice, role="member")
        ConversationMember.objects.create(conversation=dm, user=self.bob, role="member")

        m1 = Message.objects.create(conversation=dm, sender=self.alice, content="Hello world meeting tomorrow")
        m2 = Message.objects.create(conversation=dm, sender=self.bob, content="Invoice attached for design")

        # 1. Fuzzy similarity search (typos + senderId filter)
        fuzzy_res = self.client.get(f"/api/v1/message/search/{dm.id}?q=meetng%20tomorw")
        self.assertEqual(fuzzy_res.status_code, status.HTTP_200_OK)
        self.assertTrue(any(m["_id"] == str(m1.id) for m in fuzzy_res.data["messages"]))
        self.assertGreaterEqual(fuzzy_res.data["messages"][0]["matchScore"], 56)

        sender_filtered = self.client.get(f"/api/v1/message/search/{dm.id}?q=invoce&senderId={self.bob.id}")
        self.assertEqual(sender_filtered.status_code, status.HTTP_200_OK)
        self.assertEqual(len(sender_filtered.data["messages"]), 1)
        self.assertEqual(sender_filtered.data["messages"][0]["_id"], str(m2.id))

        # 2. Per-user Clear Chat hides messages ONLY for Alice, keeps Bob's untouched
        clr = self.client.post(f"/api/v1/chat/clear/{dm.id}")
        self.assertEqual(clr.status_code, status.HTTP_200_OK)

        alice_msgs = self.client.get(f"/api/v1/message/chat/{dm.id}")
        self.assertEqual(len(alice_msgs.data["messages"]), 0)

        self.client.force_authenticate(user=self.bob)
        bob_msgs = self.client.get(f"/api/v1/message/chat/{dm.id}")
        self.assertEqual(len(bob_msgs.data["messages"]), 2)

        # 3. Non-creator Bob can delete DM for himself without deleting Alice's chat
        del_bob = self.client.delete(f"/api/v1/chat/{dm.id}")
        self.assertEqual(del_bob.status_code, status.HTTP_200_OK)
        bob_list = self.client.get("/api/v1/chat/my")
        self.assertFalse(any(c["_id"] == str(dm.id) for c in bob_list.data["chats"]))

        self.client.force_authenticate(user=self.alice)
        alice_list = self.client.get("/api/v1/chat/my")
        self.assertTrue(any(c["_id"] == str(dm.id) for c in alice_list.data["chats"]))

    def test_cannot_send_friend_request_when_already_friends_and_search_relationship(self):
        carol = User.objects.create_user(
            email="carol_rich@example.com",
            username="carol_rich",
            password="StrongPassword123!",
            name="Carol Rich",
        )

        # Before request: Carol appears as 'none'
        s1 = self.client.get("/api/v1/user/search?name=carol")
        self.assertEqual(s1.status_code, status.HTTP_200_OK)
        self.assertEqual(s1.data["users"][0]["relationship"], "none")

        # Alice sends request -> succeeds; Search shows 'sent'; duplicate blocked
        send_res = self.client.put("/api/v1/user/sendrequest", {"userId": str(carol.id)}, format="json")
        self.assertEqual(send_res.status_code, status.HTTP_200_OK)

        s2 = self.client.get("/api/v1/user/search?name=carol")
        self.assertEqual(s2.data["users"][0]["relationship"], "sent")

        dup_res = self.client.put("/api/v1/user/sendrequest", {"userId": str(carol.id)}, format="json")
        self.assertEqual(dup_res.status_code, status.HTTP_400_BAD_REQUEST)

        # Carol sees 'received' and cannot send reverse request; accepts instead
        self.client.force_authenticate(user=carol)
        s3 = self.client.get("/api/v1/user/search?name=alice_rich")
        self.assertEqual(s3.data["users"][0]["relationship"], "received")
        req_id = s3.data["users"][0]["pendingRequestId"]
        self.assertIsNotNone(req_id)

        rev_res = self.client.put("/api/v1/user/sendrequest", {"userId": str(self.alice.id)}, format="json")
        self.assertEqual(rev_res.status_code, status.HTTP_400_BAD_REQUEST)

        acc_res = self.client.put("/api/v1/user/acceptrequest", {"requestId": req_id, "accept": True}, format="json")
        self.assertEqual(acc_res.status_code, status.HTTP_200_OK)

        # Once friends: neither Carol nor Alice can send another friend request
        again_carol = self.client.put("/api/v1/user/sendrequest", {"userId": str(self.alice.id)}, format="json")
        self.assertEqual(again_carol.status_code, status.HTTP_400_BAD_REQUEST)

        self.client.force_authenticate(user=self.alice)
        again_alice = self.client.put("/api/v1/user/sendrequest", {"userId": str(carol.id)}, format="json")
        self.assertEqual(again_alice.status_code, status.HTTP_400_BAD_REQUEST)

        s4 = self.client.get("/api/v1/user/search?name=carol")
        self.assertEqual(s4.data["users"][0]["relationship"], "friends")

        # Even if DM exists without an accepted Request row, they are treated as friends
        dm = Conversation.objects.create(type="direct", creator=self.alice)
        ConversationMember.objects.create(conversation=dm, user=self.alice, role="member")
        ConversationMember.objects.create(conversation=dm, user=self.bob, role="member")
        dm_req = self.client.put("/api/v1/user/sendrequest", {"userId": str(self.bob.id)}, format="json")
        self.assertEqual(dm_req.status_code, status.HTTP_400_BAD_REQUEST)
        s5 = self.client.get("/api/v1/user/search?name=bob_rich")
        self.assertEqual(s5.data["users"][0]["relationship"], "friends")

    def test_global_search_slow_mode_join_approval_and_mention_all(self):
        from apps.messages_app.interactive import has_mention_all

        self.assertTrue(has_mention_all("Hey @all check this out"))
        self.assertTrue(has_mention_all("@everyone meeting at 5"))
        self.assertFalse(has_mention_all("email me at foo@all.com"))

        # 1. Global search across both Group and DM (with typos)
        dm = Conversation.objects.create(type="direct", creator=self.alice)
        ConversationMember.objects.create(conversation=dm, user=self.alice, role="member")
        ConversationMember.objects.create(conversation=dm, user=self.bob, role="member")
        Message.objects.create(conversation=self.conv, sender=self.alice, content="Quarterly budget spreadsheet uploaded")
        Message.objects.create(conversation=dm, sender=self.bob, content="Updated budget deck ready")

        gs = self.client.get("/api/v1/message/search-all?q=budgt%20spredsheet")
        self.assertEqual(gs.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(gs.data["totalMatches"], 1)
        chat_ids = {m["chatId"] for m in gs.data["messages"]}
        self.assertIn(str(self.conv.id), chat_ids)

        # 2. Group moderation: slow mode (30s) + require_join_approval
        mod_res = self.client.put(
            f"/api/v1/chat/{self.conv.id}/moderation",
            {"slow_mode_seconds": 30, "require_join_approval": True},
            format="json",
        )
        self.assertEqual(mod_res.status_code, status.HTTP_200_OK)
        self.assertEqual(mod_res.data["slowModeSeconds"], 30)
        self.assertTrue(mod_res.data["requireJoinApproval"])

        # Admin Alice bypasses slow mode
        a1 = self.client.post("/api/v1/message/send", {"chatId": str(self.conv.id), "message": "Admin 1"}, format="json")
        a2 = self.client.post("/api/v1/message/send", {"chatId": str(self.conv.id), "message": "Admin 2"}, format="json")
        self.assertEqual(a1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(a2.status_code, status.HTTP_201_CREATED)

        # Non-admin Bob hits 429 on rapid second message
        self.client.force_authenticate(user=self.bob)
        b1 = self.client.post("/api/v1/message/send", {"chatId": str(self.conv.id), "message": "Bob 1"}, format="json")
        b2 = self.client.post("/api/v1/message/send", {"chatId": str(self.conv.id), "message": "Bob 2"}, format="json")
        self.assertEqual(b1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(b2.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(b2.data["code"], "slow_mode")

        # 3. Invite link join approval queue
        self.client.force_authenticate(user=self.alice)
        inv = self.client.post(f"/api/v1/chat/{self.conv.id}/invite", {"max_uses": 5}, format="json")
        self.assertEqual(inv.status_code, status.HTTP_201_CREATED)
        tok = inv.data["token"]

        carol = User.objects.create_user(
            email="carol_mod@example.com",
            username="carol_mod",
            password="StrongPassword123!",
            name="Carol Mod",
        )
        self.client.force_authenticate(user=carol)
        inspect_res = self.client.get(f"/api/v1/chat/invite/{tok}")
        self.assertEqual(inspect_res.status_code, status.HTTP_200_OK)
        self.assertTrue(inspect_res.data["invitation"]["requireJoinApproval"])

        join_res = self.client.post(f"/api/v1/chat/invite/{tok}/accept")
        self.assertEqual(join_res.status_code, status.HTTP_202_ACCEPTED)
        self.assertTrue(join_res.data["pendingApproval"])
        self.assertFalse(ConversationMember.objects.filter(conversation=self.conv, user=carol).exists())

        # Admin lists and approves Carol
        self.client.force_authenticate(user=self.alice)
        jr_list = self.client.get(f"/api/v1/chat/{self.conv.id}/join-requests")
        self.assertEqual(jr_list.status_code, status.HTTP_200_OK)
        self.assertEqual(len(jr_list.data["requests"]), 1)
        req_id = jr_list.data["requests"][0]["_id"]

        app_res = self.client.post(f"/api/v1/chat/join-requests/{req_id}/review", {"approve": True}, format="json")
        self.assertEqual(app_res.status_code, status.HTTP_200_OK)
        self.assertTrue(ConversationMember.objects.filter(conversation=self.conv, user=carol).exists())

    def test_widgets_saved_vault_snooze_unread_and_bulk_actions(self):
        from datetime import timedelta
        from django.utils import timezone

        # 1. Saved Messages personal vault
        saved_res = self.client.post("/api/v1/chat/saved")
        self.assertEqual(saved_res.status_code, status.HTTP_200_OK)
        vault_id = saved_res.data["chatId"]
        my_chats = self.client.get("/api/v1/chat/my")
        vault_entry = next((c for c in my_chats.data["chats"] if c["_id"] == vault_id), None)
        self.assertIsNotNone(vault_entry)
        self.assertTrue(vault_entry["isSavedMessages"])

        # 2. Mark as Unread + Mute Snooze 8h
        u_res = self.client.post(f"/api/v1/chat/unread/{self.conv.id}")
        self.assertEqual(u_res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(u_res.data["unreadCount"], 1)

        m_res = self.client.post(f"/api/v1/chat/mute/{self.conv.id}", {"durationHours": 8}, format="json")
        self.assertEqual(m_res.status_code, status.HTTP_200_OK)
        self.assertTrue(m_res.data["isMuted"])
        self.assertIsNotNone(m_res.data["muteUntil"])

        un_res = self.client.post(f"/api/v1/chat/mute/{self.conv.id}", {"mute": False}, format="json")
        self.assertFalse(un_res.data["isMuted"])
        self.assertIsNone(un_res.data["muteUntil"])

        # 3. Interactive Checklist, Spin-the-Wheel, Countdown
        todo_res = self.client.post(
            "/api/v1/message/interactive/widget/create",
            {"chatId": str(self.conv.id), "widgetType": "checklist", "title": "Trip Packing", "items": ["Passport", "Charger"]},
            format="json",
        )
        self.assertEqual(todo_res.status_code, status.HTTP_201_CREATED)
        todo_id = todo_res.data["message"]["_id"]
        first_item_id = todo_res.data["message"]["attachments"][0]["items"][0]["id"]

        tog = self.client.post(f"/api/v1/message/interactive/widget/{todo_id}/action", {"action": "toggle", "itemId": first_item_id}, format="json")
        self.assertEqual(tog.status_code, status.HTTP_200_OK)
        self.assertTrue(tog.data["attachments"][0]["items"][0]["done"])

        add_it = self.client.post(f"/api/v1/message/interactive/widget/{todo_id}/action", {"action": "add", "text": "Water"}, format="json")
        self.assertEqual(len(add_it.data["attachments"][0]["items"]), 3)

        spin_res = self.client.post(
            "/api/v1/message/interactive/widget/create",
            {"chatId": str(self.conv.id), "widgetType": "roulette", "title": "Lunch", "options": ["Pizza", "Tacos", "Sushi"]},
            format="json",
        )
        self.assertEqual(spin_res.status_code, status.HTTP_201_CREATED)
        spin_id = spin_res.data["message"]["_id"]
        spun = self.client.post(f"/api/v1/message/interactive/widget/{spin_id}/action", {"action": "spin"}, format="json")
        self.assertEqual(spun.status_code, status.HTTP_200_OK)
        self.assertEqual(spun.data["attachments"][0]["spinCount"], 1)
        self.assertIn(spun.data["attachments"][0]["winnerText"], ["Pizza", "Tacos", "Sushi"])

        cd_res = self.client.post(
            "/api/v1/message/interactive/widget/create",
            {"chatId": str(self.conv.id), "widgetType": "countdown", "title": "Launch", "targetIso": (timezone.now() + timedelta(hours=2)).isoformat()},
            format="json",
        )
        self.assertEqual(cd_res.status_code, status.HTTP_201_CREATED)

        # 4. Bulk Star, Bulk Forward, Bulk Delete For Me
        msg_ids = [todo_id, spin_id]
        bs = self.client.post("/api/v1/message/bulk-star", {"messageIds": msg_ids}, format="json")
        self.assertEqual(bs.status_code, status.HTTP_200_OK)
        self.assertEqual(bs.data["starredCount"], 2)

        bf = self.client.post("/api/v1/message/forward", {"messageIds": msg_ids, "targetChatIds": [vault_id]}, format="json")
        self.assertEqual(bf.status_code, status.HTTP_200_OK)
        self.assertEqual(bf.data["forwardedCount"], 2)

        bd = self.client.post("/api/v1/message/bulk-delete", {"messageIds": [cd_res.data["message"]["_id"]], "mode": "me"}, format="json")
        self.assertEqual(bd.status_code, status.HTTP_200_OK)
        self.assertEqual(len(bd.data["deletedIds"]), 1)





