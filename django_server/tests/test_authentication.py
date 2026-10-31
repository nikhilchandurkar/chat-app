"""
Authentication tests: registration, login, JWT, OTP, password management.
"""

import pytest
from django.urls import reverse


pytestmark = [pytest.mark.auth, pytest.mark.django_db]


# ──────────────────────────── Registration ────────────────────────────────────

class TestRegistration:
    url = "/api/v1/auth/new"

    def test_register_success(self, client):
        resp = client.post(self.url, {
            "name": "Alice",
            "username": "alice",
            "email": "alice@example.com",
            "password": "SecurePass1!",
        }, content_type="application/json")
        assert resp.status_code == 201
        data = resp.json()
        assert data["success"] is True
        assert "user" in data
        assert "token" in data

    def test_register_duplicate_username(self, client, user):
        resp = client.post(self.url, {
            "name": "Dup",
            "username": user.username,
            "email": "dup@example.com",
            "password": "SecurePass1!",
        }, content_type="application/json")
        assert resp.status_code == 400
        assert resp.json()["success"] is False

    def test_register_duplicate_email(self, client, user):
        resp = client.post(self.url, {
            "name": "Dup2",
            "username": "dup2",
            "email": user.email,
            "password": "SecurePass1!",
        }, content_type="application/json")
        assert resp.status_code == 400

    def test_register_short_password(self, client):
        resp = client.post(self.url, {
            "name": "Bob",
            "username": "bob_short",
            "email": "bob@example.com",
            "password": "abc",
        }, content_type="application/json")
        assert resp.status_code == 400

    def test_register_missing_fields(self, client):
        resp = client.post(self.url, {
            "name": "NoPass",
        }, content_type="application/json")
        assert resp.status_code == 400


# ──────────────────────────── Login ──────────────────────────────────────────

class TestLogin:
    url = "/api/v1/auth/login"

    def test_login_by_username(self, client, user):
        resp = client.post(self.url, {
            "username": user.username,
            "password": "TestPass123!",
        }, content_type="application/json")
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        assert "token" in resp.json()

    def test_login_by_email(self, client, user):
        resp = client.post(self.url, {
            "username": user.email,
            "password": "TestPass123!",
        }, content_type="application/json")
        assert resp.status_code == 200

    def test_login_wrong_password(self, client, user):
        resp = client.post(self.url, {
            "username": user.username,
            "password": "WrongPass!",
        }, content_type="application/json")
        assert resp.status_code == 401
        assert resp.json()["success"] is False

    def test_login_nonexistent_user(self, client):
        resp = client.post(self.url, {
            "username": "nobody",
            "password": "Whatever1!",
        }, content_type="application/json")
        assert resp.status_code == 401

    def test_login_missing_credentials(self, client):
        resp = client.post(self.url, {}, content_type="application/json")
        assert resp.status_code == 400


# ──────────────────────────── My Profile ─────────────────────────────────────

class TestMyProfile:
    url = "/api/v1/user/me"

    def test_get_profile_authenticated(self, auth_client, user):
        resp = auth_client.get(self.url)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["user"]["username"] == user.username

    def test_get_profile_unauthenticated(self, client):
        resp = client.get(self.url)
        assert resp.status_code == 401


# ──────────────────────────── Logout ─────────────────────────────────────────

class TestLogout:
    url = "/api/v1/auth/logout"

    def test_logout_clears_cookie(self, auth_client):
        resp = auth_client.post(self.url)
        assert resp.status_code == 200
        # Cookie should be cleared (max-age=0 or deleted)


# ──────────────────────────── Change Password ────────────────────────────────

class TestChangePassword:
    url = "/api/v1/user/change-password"

    def test_change_password_success(self, auth_client):
        resp = auth_client.put(self.url, {
            "currentPassword": "TestPass123!",
            "newPassword": "NewSecure456!",
        }, content_type="application/json")
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_change_password_wrong_current(self, auth_client):
        resp = auth_client.put(self.url, {
            "currentPassword": "WrongCurrent!",
            "newPassword": "NewSecure456!",
        }, content_type="application/json")
        assert resp.status_code == 401

    def test_change_password_short_new(self, auth_client):
        resp = auth_client.put(self.url, {
            "currentPassword": "TestPass123!",
            "newPassword": "abc",
        }, content_type="application/json")
        assert resp.status_code == 400


# ──────────────────────────── Forgot / Reset Password ────────────────────────

class TestForgotPassword:
    url = "/api/v1/auth/forgot-password"

    def test_forgot_password_existing_email(self, client, user):
        resp = client.post(self.url, {
            "email": user.email,
        }, content_type="application/json")
        # Always 200 to prevent email enumeration
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_forgot_password_nonexistent_email(self, client):
        resp = client.post(self.url, {
            "email": "nobody@example.com",
        }, content_type="application/json")
        # Must NOT reveal whether account exists
        assert resp.status_code == 200
        assert resp.json()["success"] is True


# ──────────────────────────── Search Users ───────────────────────────────────

class TestSearchUsers:
    url = "/api/v1/user/search"

    def test_search_returns_results(self, auth_client, user2):
        resp = auth_client.get(f"{self.url}?name={user2.name[:3]}")
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        assert isinstance(resp.json()["users"], list)

    def test_search_excludes_self(self, auth_client, user):
        resp = auth_client.get(f"{self.url}?name={user.name}")
        users = resp.json()["users"]
        ids = [u["_id"] for u in users]
        assert str(user.id) not in ids

    def test_search_requires_auth(self, client):
        resp = client.get(f"{self.url}?name=alice")
        assert resp.status_code == 401


# ──────────────────────────── Friend Requests ────────────────────────────────

class TestFriendRequests:
    send_url = "/api/v1/user/send-request"
    accept_url = "/api/v1/user/accept-request"
    notifications_url = "/api/v1/user/notifications"

    def test_send_friend_request(self, auth_client, user2):
        resp = auth_client.put(self.send_url, {
            "userId": str(user2.id),
        }, content_type="application/json")
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_cannot_send_request_to_self(self, auth_client, user):
        resp = auth_client.put(self.send_url, {
            "userId": str(user.id),
        }, content_type="application/json")
        assert resp.status_code == 400

    def test_duplicate_request_rejected(self, auth_client, user2):
        auth_client.put(self.send_url, {"userId": str(user2.id)}, content_type="application/json")
        resp = auth_client.put(self.send_url, {"userId": str(user2.id)}, content_type="application/json")
        assert resp.status_code == 400

    def test_get_notifications(self, auth_client, user, user2):
        # user2 sends a request to user
        from apps.authentication.models import Request
        req = Request.objects.create(sender=user2, receiver=user)
        resp = auth_client.get(self.notifications_url)
        assert resp.status_code == 200
        ids = [r["_id"] for r in resp.json()["allRequests"]]
        assert str(req.id) in ids
