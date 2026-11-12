"""Tests for PublicUserProfileView privacy controls and relationship metadata."""

import uuid
from rest_framework import status
from rest_framework.test import APITestCase

from apps.authentication.models import BlockedUser, Request, User
from apps.chat.models import Conversation, ConversationMember


class PublicUserProfileTestCase(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            email="alice_profile@example.com",
            username="alice_profile",
            password="StrongPassword123!",
            name="Alice Viewer",
        )
        self.bob = User.objects.create_user(
            email="bob_profile@example.com",
            username="bob_profile",
            password="StrongPassword123!",
            name="Bob Target",
            bio="Coffee & Rust developer",
            avatar={"url": "/api/v1/media/avatars/bob.png"},
            status="online",
        )

        login_res = self.client.post(
            "/api/v1/auth/login",
            {"username": self.alice.username, "password": "StrongPassword123!", "device_id": "test-web"},
            format="json",
        )
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_res.data['token']}")

    def test_view_public_profile_with_shared_group(self):
        group = Conversation.objects.create(name="Dev Hangout", type="group", group_chat=True, creator=self.alice)
        ConversationMember.objects.create(conversation=group, user=self.alice, role="owner")
        ConversationMember.objects.create(conversation=group, user=self.bob, role="member")

        res = self.client.get(f"/api/v1/user/profile/{self.bob.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        payload = res.data["user"]
        self.assertEqual(payload["username"], "bob_profile")
        self.assertEqual(payload["name"], "Bob Target")
        self.assertEqual(payload["bio"], "Coffee & Rust developer")
        self.assertEqual(payload["avatar"]["url"], "/api/v1/media/avatars/bob.png")
        self.assertEqual(payload["status"], "online")
        self.assertNotIn("email", payload)
        self.assertEqual(len(payload["sharedGroups"]), 1)
        self.assertEqual(payload["sharedGroups"][0]["name"], "Dev Hangout")
        self.assertEqual(payload["relationship"], "none")

    def test_privacy_masks_avatar_online_and_bio(self):
        self.bob.privacy = {"profile": "nobody"}
        self.bob.save(update_fields=["privacy"])
        self.bob.profile.privacy_avatar = "nobody"
        self.bob.profile.privacy_online = "contacts"
        self.bob.profile.privacy_last_seen = "nobody"
        self.bob.profile.save()

        res = self.client.get(f"/api/v1/user/profile/{self.bob.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        payload = res.data["user"]
        self.assertIsNone(payload["avatar"])
        self.assertEqual(payload["status"], "hidden")
        self.assertIsNone(payload["lastSeen"])
        self.assertEqual(payload["bio"], "")

    def test_blocked_user_hides_private_fields_and_unknown_returns_404(self):
        BlockedUser.objects.create(user=self.alice, blocked_user=self.bob)
        res = self.client.get(f"/api/v1/user/profile/{self.bob.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["user"]["isBlocked"])
        self.assertIsNone(res.data["user"]["avatar"])
        self.assertEqual(res.data["user"]["bio"], "")

        missing = self.client.get(f"/api/v1/user/profile/{uuid.uuid4()}")
        self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)

    def test_pending_friend_request_reflected(self):
        req = Request.objects.create(sender=self.bob, receiver=self.alice, status="pending")
        res = self.client.get(f"/api/v1/user/profile/{self.bob.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["user"]["relationship"], "received")
        self.assertEqual(res.data["user"]["pendingRequestId"], str(req.id))

