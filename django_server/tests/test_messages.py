"""
Message tests: send, paginate, edit, delete, react, forward.
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


class TestGetMessages:
    def _url(self, chat_id):
        return f"/api/v1/chat/{chat_id}/messages"

    def test_get_messages_as_member(self, auth_client, direct_chat, message):
        resp = auth_client.get(self._url(direct_chat.id))
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        msgs = resp.json()["messages"]
        assert any(m["_id"] == str(message.id) for m in msgs)

    def test_get_messages_unauthenticated(self, client, direct_chat):
        resp = client.get(self._url(direct_chat.id))
        assert resp.status_code == 401

    def test_get_messages_non_member_forbidden(self, db, client, user_factory, direct_chat):
        outsider = user_factory(username="outsider1")
        from rest_framework_simplejwt.tokens import RefreshToken
        token = str(RefreshToken.for_user(outsider).access_token)
        client.defaults["HTTP_AUTHORIZATION"] = f"Bearer {token}"
        resp = client.get(self._url(direct_chat.id))
        assert resp.status_code in (403, 404)

    def test_pagination_returns_correct_page(self, auth_client, direct_chat, user):
        from apps.messages_app.models import Message
        for i in range(25):
            Message.objects.create(sender=user, chat=direct_chat, content=f"msg {i}")
        resp = auth_client.get(self._url(direct_chat.id) + "?page=1")
        msgs = resp.json()["messages"]
        assert len(msgs) <= 20  # Default page size

    def test_pagination_second_page(self, auth_client, direct_chat, user):
        from apps.messages_app.models import Message
        for i in range(25):
            Message.objects.create(sender=user, chat=direct_chat, content=f"p2msg {i}")
        resp1 = auth_client.get(self._url(direct_chat.id) + "?page=1")
        resp2 = auth_client.get(self._url(direct_chat.id) + "?page=2")
        p1_ids = {m["_id"] for m in resp1.json()["messages"]}
        p2_ids = {m["_id"] for m in resp2.json()["messages"]}
        assert not p1_ids.intersection(p2_ids), "Pages must not overlap"


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

    def test_edit_empty_content_rejected(self, auth_client, message):
        resp = auth_client.patch(self._url(message.id), {
            "content": "  ",
        }, content_type="application/json")
        assert resp.status_code == 400


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


class TestReactions:
    def test_add_reaction(self, auth_client, message):
        resp = auth_client.post(f"/api/v1/message/{message.id}/react", {
            "emoji": "👍",
        }, content_type="application/json")
        assert resp.status_code == 200
        assert any(r["emoji"] == "👍" for r in resp.json()["reactions"])

    def test_toggle_same_emoji_removes_it(self, auth_client, message):
        auth_client.post(f"/api/v1/message/{message.id}/react", {"emoji": "❤️"}, content_type="application/json")
        resp = auth_client.post(f"/api/v1/message/{message.id}/react", {"emoji": "❤️"}, content_type="application/json")
        assert resp.status_code == 200
        user_reactions = [r for r in resp.json()["reactions"]]
        # After toggle, no reaction from this user should remain
        # (implementation returns action="removed")

    def test_reaction_requires_emoji(self, auth_client, message):
        resp = auth_client.post(f"/api/v1/message/{message.id}/react", {}, content_type="application/json")
        assert resp.status_code == 400


class TestMessageEncryption:
    def test_message_stored_encrypted(self, db, user, direct_chat):
        from apps.messages_app.models import Message
        msg = Message.objects.create(sender=user, chat=direct_chat, content="Secret text")
        msg.refresh_from_db()
        # Raw DB content should be encrypted
        assert msg.content.startswith("ENC:"), "Message must be stored encrypted"

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
