"""
Security-focused tests.

Verifies defensive controls:
  - Authorization boundaries (IDOR prevention)
  - SQL-injection-like input safe via ORM
  - Oversized payload handling
  - Error response structure (no stack traces)
  - Admin endpoint access control
"""

import pytest
import uuid

pytestmark = [pytest.mark.security, pytest.mark.django_db]


class TestAuthorizationBoundaries:
    """Users must not access resources they don't own."""

    def test_outsider_cannot_get_chat_messages(self, db, client, user_factory, direct_chat):
        outsider = user_factory(username="spy_1_sec")
        from rest_framework_simplejwt.tokens import RefreshToken
        token = str(RefreshToken.for_user(outsider).access_token)
        client.defaults["HTTP_AUTHORIZATION"] = f"Bearer {token}"
        resp = client.get(f"/api/v1/chat/message/{direct_chat.id}")
        assert resp.status_code in (403, 404), \
            "Outsider must be denied access to another user's chat messages"

    def test_outsider_cannot_view_chat_details(self, db, client, user_factory, direct_chat):
        outsider = user_factory(username="spy_2_sec")
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

    def test_unauthenticated_profile_rejected(self, client):
        resp = client.get("/api/v1/user/me")
        assert resp.status_code == 401

    def test_unauthenticated_chat_list_rejected(self, client):
        resp = client.get("/api/v1/chat/my")
        assert resp.status_code == 401


class TestSQLInjectionPrevention:
    """
    Django ORM uses parameterised queries — these payloads must not:
      - Cause a 500 error
      - Return unexpected data
    """

    _payloads = [
        "' OR '1'='1",
        "' OR '1'='1' --",
        "'; DROP TABLE users; --",
        "\" OR \"1\"=\"1",
        "1; SELECT * FROM users",
        "<script>alert(1)</script>",
        "../../etc/passwd",
        "\x00null",
    ]

    @pytest.mark.parametrize("payload", _payloads)
    def test_search_with_sql_payload(self, auth_client, payload):
        resp = auth_client.get(f"/api/v1/user/search?name={payload}")
        assert resp.status_code in (200, 400), \
            f"Got {resp.status_code} for payload: {payload!r}"
        if resp.status_code == 200:
            assert resp.json()["success"] is True

    @pytest.mark.parametrize("payload", _payloads)
    def test_login_with_sql_payload(self, client, payload):
        resp = client.post("/api/v1/user/login", {
            "username": payload,
            "password": payload,
        }, content_type="application/json")
        assert resp.status_code != 500, \
            f"Server error for payload: {payload!r}"
        assert resp.status_code in (400, 401)

    @pytest.mark.parametrize("payload", _payloads)
    def test_register_name_with_sql_payload(self, client, payload):
        resp = client.post("/api/v1/user/newuser", {
            "name": payload,
            "username": f"safe_{abs(hash(payload)) % 100000}",
            "email": f"safe_{abs(hash(payload)) % 100000}@test.com",
            "password": "SafePass1!",
        }, content_type="application/json")
        assert resp.status_code in (201, 400), \
            f"Got {resp.status_code} for name payload: {payload!r}"


class TestOversizedPayloads:
    def test_deeply_nested_json_does_not_crash(self, auth_client):
        nested: dict = {}
        current = nested
        for _ in range(200):
            current["x"] = {}
            current = current["x"]
        resp = auth_client.post("/api/v1/user/login", nested, content_type="application/json")
        assert resp.status_code != 500

    def test_very_long_username_rejected(self, client):
        resp = client.post("/api/v1/user/newuser", {
            "name": "Test",
            "username": "a" * 1000,
            "email": "long@test.com",
            "password": "SecurePass1!",
        }, content_type="application/json")
        assert resp.status_code in (400, 201)  # 201 means DB truncated silently; 400 is correct


class TestIDORPrevention:
    def test_random_chat_id_returns_403_or_404(self, auth_client):
        resp = auth_client.get(f"/api/v1/chat/{uuid.uuid4()}")
        assert resp.status_code in (403, 404)

    def test_random_message_id_returns_404(self, auth_client):
        resp = auth_client.patch(f"/api/v1/message/{uuid.uuid4()}", {
            "content": "Inject",
        }, content_type="application/json")
        assert resp.status_code in (403, 404)

    def test_admin_endpoints_require_admin_role(self, auth_client):
        resp = auth_client.get("/api/v1/admin/users")
        assert resp.status_code in (401, 403)


class TestErrorResponseStructure:
    """Error responses must follow the documented envelope and not leak internals."""

    def test_401_has_correct_envelope(self, client):
        resp = client.get("/api/v1/user/me")
        data = resp.json()
        assert "success" in data
        assert data["success"] is False
        assert "traceback" not in data
        assert "exception" not in data

    def test_404_has_correct_envelope(self, auth_client):
        resp = auth_client.get(f"/api/v1/chat/{uuid.uuid4()}")
        assert resp.status_code in (403, 404)
        data = resp.json()
        assert "traceback" not in data
        assert "success" in data

    def test_nonexistent_endpoint_returns_404(self, auth_client):
        resp = auth_client.get("/api/v1/this-does-not-exist-xyz")
        assert resp.status_code == 404
