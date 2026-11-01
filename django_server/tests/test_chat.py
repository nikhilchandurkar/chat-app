"""
Chat (conversation) tests: create, retrieve, manage group chats.

URL map (from chat/urls.py):
  GET  /api/v1/chat/my            list user's chats
  GET  /api/v1/chat/my/groups     list user's groups
  POST /api/v1/chat/new           create group
  GET  /api/v1/chat/<id>          chat details
  PUT  /api/v1/chat/<id>          update group
  DELETE /api/v1/chat/<id>        delete chat
  PUT  /api/v1/chat/addmembers    add members
  PUT  /api/v1/chat/removemember  remove member
  GET  /api/v1/chat/message/<id>  paginated messages
"""

import pytest

pytestmark = [pytest.mark.chat, pytest.mark.django_db]


class TestMyChats:
    url = "/api/v1/chat/my"

    def test_get_chats_authenticated(self, auth_client, direct_chat):
        resp = auth_client.get(self.url)
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        ids = [c["_id"] for c in resp.json()["chats"]]
        assert str(direct_chat.id) in ids

    def test_get_chats_unauthenticated(self, client):
        resp = client.get(self.url)
        assert resp.status_code == 401

    def test_direct_chat_shows_other_member_name(self, auth_client, direct_chat, user2):
        resp = auth_client.get(self.url)
        chats = resp.json()["chats"]
        dm = next((c for c in chats if c["_id"] == str(direct_chat.id)), None)
        assert dm is not None
        assert dm["name"] == user2.name


class TestChatDetails:
    def _url(self, chat_id):
        return f"/api/v1/chat/{chat_id}"

    def test_get_chat_detail_as_member(self, auth_client, direct_chat):
        resp = auth_client.get(self._url(direct_chat.id))
        assert resp.status_code == 200
        assert resp.json()["chat"]["_id"] == str(direct_chat.id)

    def test_get_chat_detail_as_other_member(self, auth_client2, direct_chat):
        # user2 is also a member – should succeed
        resp = auth_client2.get(self._url(direct_chat.id))
        assert resp.status_code == 200

    def test_get_chat_detail_unauthenticated(self, client, direct_chat):
        resp = client.get(self._url(direct_chat.id))
        assert resp.status_code == 401

    def test_get_chat_detail_nonexistent(self, auth_client):
        import uuid
        resp = auth_client.get(self._url(uuid.uuid4()))
        assert resp.status_code == 404

    def test_outsider_cannot_see_chat(self, db, client, user_factory, direct_chat):
        outsider = user_factory(username="outsider_chat")
        from rest_framework_simplejwt.tokens import RefreshToken
        token = str(RefreshToken.for_user(outsider).access_token)
        client.defaults["HTTP_AUTHORIZATION"] = f"Bearer {token}"
        resp = client.get(self._url(direct_chat.id))
        assert resp.status_code == 403


class TestGroupChat:
    create_url = "/api/v1/chat/new"

    def test_create_group_chat(self, auth_client, user2, user_factory):
        user3 = user_factory(username="groupuser3_c")
        resp = auth_client.post(self.create_url, {
            "name": "Test Group",
            "members": [str(user2.id), str(user3.id)],
        }, content_type="application/json")
        assert resp.status_code == 201
        assert resp.json()["success"] is True

    def test_create_group_requires_min_2_other_members(self, auth_client, user2):
        # Only 1 other member – requires at least 2
        resp = auth_client.post(self.create_url, {
            "name": "Too Small",
            "members": [str(user2.id)],
        }, content_type="application/json")
        assert resp.status_code == 400

    def test_create_group_requires_name(self, auth_client, user2, user_factory):
        user3 = user_factory(username="g3_c")
        resp = auth_client.post(self.create_url, {
            "name": "",
            "members": [str(user2.id), str(user3.id)],
        }, content_type="application/json")
        assert resp.status_code == 400

    def test_create_group_unauthenticated(self, client, user2, user_factory):
        user3 = user_factory(username="g3_unauth")
        resp = client.post(self.create_url, {
            "name": "Unauth Group",
            "members": [str(user2.id), str(user3.id)],
        }, content_type="application/json")
        assert resp.status_code == 401


class TestMyGroups:
    url = "/api/v1/chat/my/groups"

    def test_get_groups(self, auth_client, user, user2, user_factory):
        from apps.chat.models import Chat
        user3 = user_factory(username="grp_user_c")
        grp = Chat.objects.create(name="My Group", group_chat=True, creator=user)
        grp.members.add(user, user2, user3)
        grp.admins.add(user)

        resp = auth_client.get(self.url)
        assert resp.status_code == 200
        ids = [g["_id"] for g in resp.json()["groups"]]
        assert str(grp.id) in ids

    def test_groups_requires_auth(self, client):
        resp = client.get(self.url)
        assert resp.status_code == 401


class TestGetMessages:
    def _url(self, chat_id):
        return f"/api/v1/chat/message/{chat_id}"

    def test_get_messages_as_member(self, auth_client, direct_chat, user):
        from apps.messages_app.models import Message
        msg = Message.objects.create(sender=user, chat=direct_chat, content="Hello!")
        resp = auth_client.get(self._url(direct_chat.id))
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        ids = [m["_id"] for m in resp.json()["messages"]]
        assert str(msg.id) in ids

    def test_get_messages_unauthenticated(self, client, direct_chat):
        resp = client.get(self._url(direct_chat.id))
        assert resp.status_code == 401

    def test_get_messages_outsider_forbidden(self, db, client, user_factory, direct_chat):
        outsider = user_factory(username="spy_msg")
        from rest_framework_simplejwt.tokens import RefreshToken
        token = str(RefreshToken.for_user(outsider).access_token)
        client.defaults["HTTP_AUTHORIZATION"] = f"Bearer {token}"
        resp = client.get(self._url(direct_chat.id))
        assert resp.status_code in (403, 404)

    def test_pagination_page_size(self, auth_client, direct_chat, user):
        from apps.messages_app.models import Message
        for i in range(25):
            Message.objects.create(sender=user, chat=direct_chat, content=f"msg {i}")
        resp = auth_client.get(self._url(direct_chat.id) + "?page=1")
        msgs = resp.json()["messages"]
        assert len(msgs) <= 20

    def test_pagination_pages_dont_overlap(self, auth_client, direct_chat, user):
        from apps.messages_app.models import Message
        for i in range(25):
            Message.objects.create(sender=user, chat=direct_chat, content=f"p_msg {i}")
        resp1 = auth_client.get(self._url(direct_chat.id) + "?page=1")
        resp2 = auth_client.get(self._url(direct_chat.id) + "?page=2")
        p1 = {m["_id"] for m in resp1.json()["messages"]}
        p2 = {m["_id"] for m in resp2.json()["messages"]}
        assert not p1.intersection(p2), "Pages must not overlap"


class TestDeleteChat:
    def test_creator_can_delete_group(self, auth_client, user, user2, user_factory):
        from apps.chat.models import Chat
        user3 = user_factory(username="del_user_c")
        grp = Chat.objects.create(name="To Delete", group_chat=True, creator=user)
        grp.members.add(user, user2, user3)
        resp = auth_client.delete(f"/api/v1/chat/{grp.id}")
        assert resp.status_code == 200

    def test_non_creator_cannot_delete_group(self, auth_client2, user, user2, user_factory):
        from apps.chat.models import Chat
        user3 = user_factory(username="nd_user_c")
        grp = Chat.objects.create(name="Not Mine", group_chat=True, creator=user)
        grp.members.add(user, user2, user3)
        resp = auth_client2.delete(f"/api/v1/chat/{grp.id}")
        assert resp.status_code == 403


class TestAddRemoveMembers:
    def test_admin_can_add_member(self, auth_client, user, user2, user_factory):
        from apps.chat.models import Chat
        user3 = user_factory(username="new_mem_c")
        user4 = user_factory(username="add_target_c")
        grp = Chat.objects.create(name="Admin Test", group_chat=True, creator=user)
        grp.members.add(user, user2, user3)
        grp.admins.add(user)

        resp = auth_client.put("/api/v1/chat/addmembers", {
            "chatId": str(grp.id),
            "members": [str(user4.id)],
        }, content_type="application/json")
        assert resp.status_code == 200

    def test_non_admin_cannot_add_member(self, auth_client2, user, user2, user_factory):
        from apps.chat.models import Chat
        user3 = user_factory(username="nm2_c")
        user4 = user_factory(username="t4_c")
        grp = Chat.objects.create(name="No Admin", group_chat=True, creator=user)
        grp.members.add(user, user2, user3)
        grp.admins.add(user)  # Only user1 is admin, not user2

        resp = auth_client2.put("/api/v1/chat/addmembers", {
            "chatId": str(grp.id),
            "members": [str(user4.id)],
        }, content_type="application/json")
        assert resp.status_code == 403
