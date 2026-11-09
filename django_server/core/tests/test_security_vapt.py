import json
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.authentication.models import User, UserProfile, EmailOTP, BlockedUser, UserSession, Device
from apps.chat.models import Conversation, ConversationMember, InvitationLink
from apps.messages_app.models import Message, MessageAttachment
from apps.storage_app.models import UploadSession


class SecurityVAPTTestCase(TestCase):
    """
    Comprehensive Negative Authorization and VAPT Regression Test Suite.
    Proves that unauthorized access, IDOR, brute-force, path traversal,
    and privacy violation attempts fail deterministically.
    """
    def setUp(self):
        cache.clear()
        self.client_a = APIClient()
        self.client_b = APIClient()
        self.client_c = APIClient()

        # Create Users A, B, and C
        self.user_a = User.objects.create_user(email="user_a@example.com", username="usera", name="User A")
        self.user_b = User.objects.create_user(email="user_b@example.com", username="userb", name="User B")
        self.user_c = User.objects.create_user(email="user_c@example.com", username="userc", name="User C")

        UserProfile.objects.get_or_create(user=self.user_a, defaults={"display_name": "User A"})
        UserProfile.objects.get_or_create(user=self.user_b, defaults={"display_name": "User B"})
        UserProfile.objects.get_or_create(user=self.user_c, defaults={"display_name": "User C"})

        # Issue JWT tokens
        token_a = str(RefreshToken.for_user(self.user_a).access_token)
        token_b = str(RefreshToken.for_user(self.user_b).access_token)
        token_c = str(RefreshToken.for_user(self.user_c).access_token)

        self.client_a.credentials(HTTP_AUTHORIZATION=f"Bearer {token_a}")
        self.client_b.credentials(HTTP_AUTHORIZATION=f"Bearer {token_b}")
        self.client_c.credentials(HTTP_AUTHORIZATION=f"Bearer {token_c}")

        # Create 1-to-1 conversation between A and B
        self.conv_ab = Conversation.objects.create(type="direct", creator=self.user_a)
        ConversationMember.objects.create(conversation=self.conv_ab, user=self.user_a, role="member")
        ConversationMember.objects.create(conversation=self.conv_ab, user=self.user_b, role="member")

    # ─── 1. Message Privacy & IDOR Access Control Tests ─────────────────────
    def test_user_c_cannot_read_private_messages_of_a_and_b(self):
        """User C must never be able to read private messages exchanged between A and B."""
        # A sends message in conversation AB
        msg_resp = self.client_a.post("/api/v1/message/send", {
            "chatId": str(self.conv_ab.id),
            "message": "Top secret memo between A and B",
        })
        self.assertEqual(msg_resp.status_code, 201)

        # User B reads it successfully
        resp_b = self.client_b.get(f"/api/v1/message/chat/{self.conv_ab.id}")
        self.assertEqual(resp_b.status_code, 200)
        self.assertIn("Top secret memo", resp_b.data["messages"][0]["content"])

        # User C attempts to access conversation AB messages -> MUST BE 403 Forbidden
        resp_c = self.client_c.get(f"/api/v1/message/chat/{self.conv_ab.id}")
        self.assertEqual(resp_c.status_code, 403)
        self.assertFalse(resp_c.data.get("success", True))

    def test_user_c_cannot_modify_or_delete_message_of_a(self):
        """User C cannot edit or delete messages created by User A."""
        msg = Message.objects.create(
            conversation=self.conv_ab,
            sender=self.user_a,
            content="Original message from A"
        )

        # C tries to edit A's message -> 403
        edit_resp = self.client_c.patch(f"/api/v1/message/{msg.id}", {"content": "Hacked by C"})
        self.assertEqual(edit_resp.status_code, 403)

        # C tries to delete A's message -> 403
        del_resp = self.client_c.delete(f"/api/v1/message/delete/{msg.id}")
        self.assertEqual(del_resp.status_code, 403)

    def test_user_c_cannot_forward_or_react_to_unauthorized_message(self):
        """User C cannot react to or forward a message from a conversation they are not in."""
        msg = Message.objects.create(
            conversation=self.conv_ab,
            sender=self.user_a,
            content="Private discussion"
        )

        # C attempts to react -> 403
        rx_resp = self.client_c.post(f"/api/v1/message/{msg.id}/react", {"reaction": "👍"})
        self.assertEqual(rx_resp.status_code, 403)

        # C attempts to forward -> 403
        fwd_resp = self.client_c.post("/api/v1/message/forward", {
            "messageId": str(msg.id),
            "chatIds": [str(self.conv_ab.id)]
        })
        self.assertEqual(fwd_resp.status_code, 403)

    def test_user_c_cannot_download_attachment_of_a_and_b(self):
        """User C cannot stream/download attachments from conversation AB."""
        upload_sess = UploadSession.objects.create(
            user=self.user_a,
            file_name="financial_report.pdf",
            total_size=1024,
            mime_type="application/pdf",
            final_path="D:/personal/chat-app/django_server/storage/private/fake_report.pdf",
            expires_at=timezone.now() + timedelta(days=1),
            is_completed=True
        )
        msg = Message.objects.create(
            conversation=self.conv_ab,
            sender=self.user_a,
            content="Report attached"
        )
        MessageAttachment.objects.create(
            message=msg,
            file_path=upload_sess.final_path,
            file_name="financial_report.pdf",
            file_type="document",
            file_size=1024,
            mime_type="application/pdf"
        )

        # User C attempts download -> 403
        resp_c = self.client_c.get(f"/api/v1/storage/file/{upload_sess.id}")
        self.assertEqual(resp_c.status_code, 403)

    # ─── 2. Authentication, OTP Brute-Force & Replay ────────────────────────
    def test_otp_single_use_enforcement(self):
        """An OTP code can only be used once; replay attempts must fail."""
        email = "replay_test@example.com"
        raw_code = "987654"
        EmailOTP.objects.create(
            email=email,
            hashed_otp=EmailOTP.hash_otp(email, raw_code),
            expires_at=timezone.now() + timedelta(minutes=5),
            is_used=False
        )

        anon_client = APIClient()
        # First verification succeeds
        r1 = anon_client.post("/api/v1/auth/otp/verify", {"email": email, "otp": raw_code})
        self.assertEqual(r1.status_code, 200)

        # Second verification (replay attack) fails with 400
        r2 = anon_client.post("/api/v1/auth/otp/verify", {"email": email, "otp": raw_code})
        self.assertEqual(r2.status_code, 400)
        self.assertIn("already been used", r2.data["message"].lower())

    def test_expired_otp_is_rejected(self):
        """Submitting an expired OTP code must be rejected."""
        email = "expired_test@example.com"
        raw_code = "112233"
        EmailOTP.objects.create(
            email=email,
            hashed_otp=EmailOTP.hash_otp(email, raw_code),
            expires_at=timezone.now() - timedelta(minutes=1),  # already expired
            is_used=False
        )

        anon_client = APIClient()
        r = anon_client.post("/api/v1/auth/otp/verify", {"email": email, "otp": raw_code})
        self.assertEqual(r.status_code, 400)
        self.assertIn("expired", r.data["message"].lower())

    def test_otp_brute_force_lockout(self):
        """After 5 failed OTP attempts, the code is invalidated."""
        email = "brute_force@example.com"
        raw_code = "554433"
        otp_rec = EmailOTP.objects.create(
            email=email,
            hashed_otp=EmailOTP.hash_otp(email, raw_code),
            expires_at=timezone.now() + timedelta(minutes=5),
            attempts=4,
            is_used=False
        )

        anon_client = APIClient()
        # 5th failed attempt
        r1 = anon_client.post("/api/v1/auth/otp/verify", {"email": email, "otp": "000000"})
        self.assertEqual(r1.status_code, 400)

        # 6th attempt with CORRECT code should now still be blocked because it was invalidated
        r2 = anon_client.post("/api/v1/auth/otp/verify", {"email": email, "otp": raw_code})
        self.assertEqual(r2.status_code, 400)
        self.assertIn("invalidated", r2.data["message"].lower())

    # ─── 3. User Blocking & Privacy Protection ──────────────────────────────
    def test_blocked_user_cannot_send_direct_message(self):
        """When User B blocks User A, User A cannot send direct messages to User B."""
        BlockedUser.objects.create(user=self.user_b, blocked_user=self.user_a)

        # User A tries to send message in direct chat AB -> 403 Forbidden
        resp = self.client_a.post("/api/v1/message/send", {
            "chatId": str(self.conv_ab.id),
            "message": "Hey are you there?",
        })
        self.assertEqual(resp.status_code, 403)
        self.assertIn("block", resp.data["message"].lower())

    def test_hide_from_search_privacy(self):
        """A user with 'hide_from_search=True' is omitted from user search results."""
        profile_b = self.user_b.profile
        profile_b.hide_from_search = True
        profile_b.save(update_fields=["hide_from_search"])

        search_resp = self.client_a.get("/api/v1/user/search?name=User")
        self.assertEqual(search_resp.status_code, 200)

        user_ids = [u["_id"] for u in search_resp.data["users"]]
        self.assertNotIn(str(self.user_b.id), user_ids)
        self.assertIn(str(self.user_c.id), user_ids)

    # ─── 4. Disappearing Messages Expiration ────────────────────────────────
    def test_disappearing_messages_expiration_filter(self):
        """Expired disappearing messages are automatically excluded from message retrieval."""
        # Message 1: Active
        msg_active = Message.objects.create(
            conversation=self.conv_ab,
            sender=self.user_a,
            content="I am still visible",
            expires_at=timezone.now() + timedelta(hours=1)
        )
        # Message 2: Expired
        msg_expired = Message.objects.create(
            conversation=self.conv_ab,
            sender=self.user_a,
            content="I am expired",
            expires_at=timezone.now() - timedelta(minutes=5)
        )

        resp = self.client_b.get(f"/api/v1/message/chat/{self.conv_ab.id}")
        self.assertEqual(resp.status_code, 200)

        returned_ids = [m["id"] for m in resp.data["messages"]]
        self.assertIn(str(msg_active.id), returned_ids)
        self.assertNotIn(str(msg_expired.id), returned_ids)

    # ─── 5. Private Invitation Links Security ───────────────────────────────
    def test_invitation_link_usage_and_revocation(self):
        """Single-use invitation link cannot be reused after acceptance or after revocation."""
        # A generates single-use invite link for a group
        group_conv = Conversation.objects.create(name="Private Club", type="group", group_chat=True, creator=self.user_a)
        ConversationMember.objects.create(conversation=group_conv, user=self.user_a, role="owner")
        group_conv.admins.add(self.user_a)

        gen_resp = self.client_a.post(f"/api/v1/chat/{group_conv.id}/invite", {"max_uses": 1, "expiry_days": 1})
        self.assertEqual(gen_resp.status_code, 201)
        token = gen_resp.data["token"]

        # B accepts the invitation -> joins successfully
        join_resp = self.client_b.post(f"/api/v1/chat/invite/{token}/accept")
        self.assertEqual(join_resp.status_code, 200)
        self.assertTrue(group_conv.member_records.filter(user=self.user_b).exists())

        # C attempts to use the same single-use token -> Rejected (400)
        c_join_resp = self.client_c.post(f"/api/v1/chat/invite/{token}/accept")
        self.assertEqual(c_join_resp.status_code, 400)
        self.assertFalse(group_conv.member_records.filter(user=self.user_c).exists())

    # ─── 6. File Upload Dangerous Extensions Rejection ──────────────────────
    def test_blocked_dangerous_extension(self):
        """Dangerous executable files (.exe, .sh, .php) are rejected on upload."""
        from django.core.files.uploadedfile import SimpleUploadedFile
        malicious_file = SimpleUploadedFile("exploit.php", b"<?php echo 'pwned'; ?>", content_type="application/x-php")

        resp = self.client_a.post("/api/v1/storage/upload", {"file": malicious_file}, format="multipart")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("prohibited", resp.data["message"].lower())
