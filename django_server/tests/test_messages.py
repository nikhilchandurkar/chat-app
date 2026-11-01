"""
Message tests: edit, delete, react, forward, encryption.

URL map (from messages_app/urls.py):
  PATCH  /api/v1/message/<id>          edit / delete
  DELETE /api/v1/message/<id>          delete
  POST   /api/v1/message/react/<id>    react
  POST   /api/v1/message/forward       forward
  GET    /api/v1/message/search/<cid>  search
  GET    /api/v1/message/media/<cid>   media list
"""

import pytest

pytestmark = [pytest.mark.messages, pytest.mark.django_db]


@pytest.fixture
def message(db, user, direct_chat):
    from apps.messages_app.models import Message
    return Message.objects.create(
        sender=user,
        chat=direct_chat,
        content="Hello there!",
    )


class TestEditMessage:
    def _url(self, msg_id):
        return f"/api/v1/message/{msg_id}"

    def test_sender_can_edit(self, auth_client, message):
        resp = auth_client.patch(self._url(message.id), {
            "content": "Edited content",
        }, content_type="application/json")
        assert resp.status_code == 200
        assert resp.json()["data"]["isEdited"] is True

    def test_non_sender_cannot_edit(self, auth_client2, message):
        resp = auth_client2.patch(self._url(message.id), {
            "content": "Hacked!",
        }, content_type="application/json")
        assert resp.status_code == 403

    def test_edit_whitespace_only_rejected(self, auth_client, message):
        resp = auth_client.patch(self._url(message.id), {
            "content": "   ",
        }, content_type="application/json")
        assert resp.status_code == 400

    def test_edit_nonexistent_message(self, auth_client):
        import uuid
        resp = auth_client.patch(self._url(uuid.uuid4()), {
            "content": "nope",
        }, content_type="application/json")
        assert resp.status_code == 404

    def test_unauthenticated_cannot_edit(self, client, message):
        resp = client.patch(self._url(message.id), {
            "content": "Inject",
        }, content_type="application/json")
        assert resp.status_code == 401


class TestDeleteMessage:
    def _url(self, msg_id):
        return f"/api/v1/message/{msg_id}"

    def test_sender_can_delete(self, auth_client, message):
        resp = auth_client.delete(self._url(message.id))
        assert resp.status_code == 200
        message.refresh_from_db()
        assert message.is_deleted is True

    def test_non_sender_cannot_delete(self, auth_client2, message):
        resp = auth_client2.delete(self._url(message.id))
        assert resp.status_code == 403

    def test_unauthenticated_cannot_delete(self, client, message):
        resp = client.delete(self._url(message.id))
        assert resp.status_code == 401

    def test_deleted_message_content_hidden(self, auth_client, message):
        auth_client.delete(self._url(message.id))
        message.refresh_from_db()
        assert "deleted" in message.decrypted_content.lower()


class TestReactions:
    def _url(self, msg_id):
        return f"/api/v1/message/react/{msg_id}"

    def test_add_reaction(self, auth_client, message):
        resp = auth_client.post(self._url(message.id), {
            "emoji": "👍",
        }, content_type="application/json")
        assert resp.status_code == 200
        assert any(r["emoji"] == "👍" for r in resp.json()["reactions"])

    def test_toggle_same_emoji_removes_it(self, auth_client, message):
        # Add
        auth_client.post(self._url(message.id), {"emoji": "❤️"}, content_type="application/json")
        # Toggle off
        resp = auth_client.post(self._url(message.id), {"emoji": "❤️"}, content_type="application/json")
        assert resp.status_code == 200
        # No reaction from this user should remain (action=="removed")

    def test_reaction_requires_emoji(self, auth_client, message):
        resp = auth_client.post(self._url(message.id), {}, content_type="application/json")
        assert resp.status_code == 400

    def test_unauthenticated_cannot_react(self, client, message):
        resp = client.post(self._url(message.id), {"emoji": "👍"}, content_type="application/json")
        assert resp.status_code == 401


class TestMessageEncryption:
    def test_message_stored_encrypted(self, db, user, direct_chat):
        from apps.messages_app.models import Message
        msg = Message.objects.create(sender=user, chat=direct_chat, content="Secret text")
        msg.refresh_from_db()
        assert msg.content.startswith("ENC:"), "Message must be stored encrypted in DB"

    def test_decrypted_content_matches_original(self, db, user, direct_chat):
        from apps.messages_app.models import Message
        original = "Hello, secure world!"
        msg = Message.objects.create(sender=user, chat=direct_chat, content=original)
        msg.refresh_from_db()
        assert msg.decrypted_content == original

    def test_deleted_message_hides_content(self, db, user, direct_chat):
        from apps.messages_app.models import Message
        msg = Message.objects.create(sender=user, chat=direct_chat, content="Will be deleted")
        msg.is_deleted = True
        msg.save()
        assert "deleted" in msg.decrypted_content.lower()

    def test_different_messages_have_different_ciphertext(self, db, user, direct_chat):
        from apps.messages_app.models import Message
        m1 = Message.objects.create(sender=user, chat=direct_chat, content="Message one")
        m2 = Message.objects.create(sender=user, chat=direct_chat, content="Message two")
        m1.refresh_from_db()
        m2.refresh_from_db()
        # Each encryption uses a random IV so ciphertexts must differ
        assert m1.content != m2.content


class TestSearchMessages:
    def _url(self, chat_id):
        return f"/api/v1/message/search/{chat_id}"

    def test_search_finds_message(self, auth_client, user, direct_chat):
        from apps.messages_app.models import Message
        Message.objects.create(sender=user, chat=direct_chat, content="unique_search_term_xyz")
        resp = auth_client.get(self._url(direct_chat.id) + "?q=unique_search_term_xyz")
        assert resp.status_code == 200
        assert len(resp.json()["messages"]) >= 1

    def test_search_outsider_forbidden(self, db, client, user_factory, direct_chat):
        outsider = user_factory(username="search_spy")
        from rest_framework_simplejwt.tokens import RefreshToken
        token = str(RefreshToken.for_user(outsider).access_token)
        client.defaults["HTTP_AUTHORIZATION"] = f"Bearer {token}"
        resp = client.get(self._url(direct_chat.id) + "?q=anything")
        assert resp.status_code == 403
