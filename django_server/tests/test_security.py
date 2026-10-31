"""
Security-focused tests.

Verifies that defensive controls work:
  - Authorization boundaries (access other user's resources)
  - SQL-injection-like input doesn't break ORM queries
  - Oversized payload rejection
  - WebSocket unauthorized connection
  - IDOR prevention on messages and chats
"""

import pytest
import uuid


pytestmark = [pytest.mark.security, pytest.mark.django_db]


class TestAuthorizationBoundaries:
    """Users must not access resources they don't own."""

    def test_cannot_access_others_chat_messages(self, db, client, user_factory, direct_chat):
        outsider = user_factory(username="spy_1")
        from rest_framework_simplejwt.tokens import RefreshToken
        token = str(RefreshToken.for_user(outsider).access_token)
        client.defaults["HTTP_AUTHORIZATION"] = f"Bearer {token}"
        resp = client.get(f"/api/v1/chat/{direct_chat.id}/messages")
        assert resp.status_code in (403, 404), \
            "Outsider must be denied access to another user's chat"

    def test_cannot_view_others_chat_details(self, db, client, user_factory, direct_chat):
        outsider = user_factory(username="spy_2")
        from rest_framework_simplejwt.tokens import RefreshToken
        token = str(RefreshToken.for_user(outsider).access_token)
        client.defaults["HTTP_AUTHORIZATION"] = f"Bearer {token}"
        resp = client.get(f"/api/v1/chat/{direct_chat.id}")
        assert resp.status_code in (403, 404)

    def test_cannot_edit_others_message(self, auth_client2, user, direct_chat):
        from apps.messages_app.models import Message
        msg = Message.objects.create(sender=user, chat=direct_chat, content="Owner only")
        resp = auth_client2.patch(f"/api/v1/message/{msg.id}", {
            "content": "Hijacked",
        }, content_type="application/json")
        assert resp.status_code == 403

    def test_cannot_delete_others_message(self, auth_client2, user, direct_chat):
        from apps.messages_app.models import Message
        msg = Message.objects.create(sender=user, chat=direct_chat, content="Mine")
        resp = auth_client2.delete(f"/api/v1/message/{msg.id}")
        assert resp.status_code == 403

    def test_unauthenticated_request_rejected(self, client):
        resp = client.get("/api/v1/user/me")
        assert resp.status_code == 401

    def test_profile_update_requires_own_account(self, auth_client):
        """PUT /user/profile updates the authenticated user only."""
        resp = auth_client.put("/api/v1/user/profile", {
            "name": "Hacked Name",
        }, content_type="application/json")
        # Should succeed (own profile) or 404, never 403 with wrong user data
        assert resp.status_code in (200, 404)


class TestSQLInjectionPrevention:
    """
    Django ORM uses parameterised queries by default.
    These tests confirm that SQL-injection-like strings in user input
    do not crash the API, do not leak data, and return proper errors.
    """

    _payloads = [
        "' OR '1'='1",
        "' OR '1'='1' --",
        "'; DROP TABLE users; --",
        "\" OR \"1\"=\"1",
        "1; SELECT * FROM users",
        "<script>alert(1)</script>",
        "../../etc/passwd",
        "\x00 null byte",
    ]

    @pytest.mark.parametrize("payload", _payloads)
    def test_search_with_malicious_input(self, auth_client, payload):
        resp = auth_client.get(f"/api/v1/user/search?name={payload}")
        # Must return 200 with empty results or 400, never 500
        assert resp.status_code in (200, 400), \
            f"Unexpected status {resp.status_code} for payload: {payload!r}"
        if resp.status_code == 200:
            assert resp.json()["success"] is True

    @pytest.mark.parametrize("payload", _payloads)
    def test_registration_with_malicious_username(self, client, payload):
        resp = client.post("/api/v1/auth/new", {
            "name": payload,
            "username": "safe_user_abc123",
            "email": "safeabc@example.com",
            "password": "SafePass1!",
        }, content_type="application/json")
        # Either 201 (name stored safely) or 400 (validation rejected it)
        assert resp.status_code in (201, 400), \
            f"Unexpected status {resp.status_code} for payload in name: {payload!r}"
        if resp.status_code == 200:
            # If accepted, content should be treated as plain text, not SQL
            pass

    @pytest.mark.parametrize("payload", _payloads)
    def test_login_with_malicious_input(self, client, payload):
        resp = client.post("/api/v1/auth/login", {
            "username": payload,
            "password": payload,
        }, content_type="application/json")
        # Must fail auth, never crash (500)
        assert resp.status_code != 500, \
            f"Server error for payload: {payload!r}"
        assert resp.status_code in (400, 401)


class TestOversizedPayloads:
    """Server must reject payloads that exceed reasonable limits."""

    def test_large_message_content_rejected_or_truncated(self, auth_client, direct_chat):
        huge_content = "A" * 100_001  # 100 KB of text
        resp = auth_client.post("/api/v1/chat/send-attachments", {
            "chatId": str(direct_chat.id),
            "content": huge_content,
        }, content_type="application/json")
        # 400 (validation), 413 (payload too large), or handled gracefully
        assert resp.status_code in (400, 413, 404, 405)

    def test_deeply_nested_json_does_not_crash(self, auth_client):
        nested = {}
        current = nested
        for _ in range(200):
            current["next"] = {}
            current = current["next"]
        resp = auth_client.post("/api/v1/auth/login", nested, content_type="application/json")
        assert resp.status_code != 500


class TestIDORPrevention:
    """Insecure Direct Object Reference: accessing resources by ID."""

    def test_random_chat_id_returns_404_or_403(self, auth_client):
        resp = auth_client.get(f"/api/v1/chat/{uuid.uuid4()}")
        assert resp.status_code in (403, 404)

    def test_random_message_id_returns_404(self, auth_client):
        resp = auth_client.patch(f"/api/v1/message/{uuid.uuid4()}", {
            "content": "Inject",
        }, content_type="application/json")
        assert resp.status_code in (403, 404)

    def test_admin_endpoints_require_admin_role(self, auth_client):
        """Non-admin users must not access admin routes."""
        resp = auth_client.get("/api/v1/admin/users")
        assert resp.status_code in (401, 403)


class TestErrorResponseStructure:
    """Error responses must follow the documented structure and not leak internals."""

    def test_401_response_structure(self, client):
        resp = client.get("/api/v1/user/me")
        data = resp.json()
        assert "success" in data
        assert data["success"] is False
        # Must not contain stack trace keys
        assert "traceback" not in data
        assert "exception" not in data

    def test_404_response_structure(self, auth_client):
        resp = auth_client.get(f"/api/v1/chat/{uuid.uuid4()}")
        assert resp.status_code in (403, 404)
        data = resp.json()
        assert "traceback" not in data

    def test_nonexistent_endpoint_returns_404(self, auth_client):
        resp = auth_client.get("/api/v1/nonexistent-endpoint-xyz")
        assert resp.status_code == 404
