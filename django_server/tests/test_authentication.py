"""
Authentication tests: registration, login, JWT, OTP, password management.

URL map (from urls.py):
  POST /api/v1/user/newuser          register
  POST /api/v1/user/login            login
  POST /api/v1/user/logout           logout
  GET  /api/v1/user/me               profile
  PUT  /api/v1/user/password         change password
  POST /api/v1/user/forgot-password  forgot password
  POST /api/v1/user/reset-password   reset password
  GET  /api/v1/user/search           search users
  PUT  /api/v1/user/sendrequest      send friend request
  PUT  /api/v1/user/acceptrequest    accept friend request
  GET  /api/v1/user/notifications    pending requests
"""

import pytest

pytestmark = [pytest.mark.auth, pytest.mark.django_db]


# ─── Registration ─────────────────────────────────────────────────────────────

class TestRegistration:
    url = "/api/v1/user/newuser"

    def test_register_success(self, client):
        resp = client.post(self.url, {
            "name": "Alice",
            "username": "alice_reg",
            "email": "alice_reg@example.com",
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
            "username": "dup2_reg",
            "email": user.email,
            "password": "SecurePass1!",
        }, content_type="application/json")
        assert resp.status_code == 400

    def test_register_short_password(self, client):
        resp = client.post(self.url, {
            "name": "Bob",
            "username": "bob_short_reg",
            "email": "bob_short@example.com",
            "password": "abc",
        }, content_type="application/json")
        assert resp.status_code == 400

    def test_register_missing_fields(self, client):
        resp = client.post(self.url, {"name": "NoPass"}, content_type="application/json")
        assert resp.status_code == 400


# ─── Login ────────────────────────────────────────────────────────────────────

class TestLogin:
    url = "/api/v1/user/login"

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
            "username": "nobody_at_all",
            "password": "Whatever1!",
        }, content_type="application/json")
        assert resp.status_code == 401

    def test_login_missing_credentials(self, client):
        resp = client.post(self.url, {}, content_type="application/json")
        assert resp.status_code == 400


# ─── My Profile ───────────────────────────────────────────────────────────────

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


# ─── Logout ───────────────────────────────────────────────────────────────────

class TestLogout:
    url = "/api/v1/user/logout"

    def test_logout_returns_200(self, auth_client):
        resp = auth_client.post(self.url)
        assert resp.status_code == 200
        assert resp.json()["success"] is True


# ─── Change Password ──────────────────────────────────────────────────────────

class TestChangePassword:
    url = "/api/v1/user/password"

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


# ─── Forgot / Reset Password ──────────────────────────────────────────────────

class TestForgotPassword:
    url = "/api/v1/user/forgot-password"

    def test_forgot_password_existing_email(self, client, user):
        resp = client.post(self.url, {"email": user.email}, content_type="application/json")
        # Always 200 to prevent email enumeration
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_forgot_password_nonexistent_email(self, client):
        resp = client.post(self.url, {"email": "nobody@example.com"}, content_type="application/json")
        # Must NOT reveal whether account exists
        assert resp.status_code == 200
        assert resp.json()["success"] is True


# ─── Search Users ─────────────────────────────────────────────────────────────

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


# ─── Friend Requests ──────────────────────────────────────────────────────────

class TestFriendRequests:
    send_url = "/api/v1/user/sendrequest"
    accept_url = "/api/v1/user/acceptrequest"
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
        from apps.authentication.models import Request
        req = Request.objects.create(sender=user2, receiver=user)
        resp = auth_client.get(self.notifications_url)
        assert resp.status_code == 200
        ids = [r["_id"] for r in resp.json()["allRequests"]]
        assert str(req.id) in ids
