"""
Chat (conversation) tests: create, retrieve, manage group chats.
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

    def test_direct_chat_shows_other_member(self, auth_client, direct_chat, user2):
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

    def test_get_chat_detail_as_non_member(self, auth_client2, direct_chat):
        # auth_client2 is user2 who IS a member – this should succeed
        resp = auth_client2.get(self._url(direct_chat.id))
        assert resp.status_code == 200

    def test_get_chat_detail_unauthorized(self, client, direct_chat):
        resp = client.get(self._url(direct_chat.id))
        assert resp.status_code == 401

    def test_get_chat_detail_nonexistent(self, auth_client):
        import uuid
        resp = auth_client.get(self._url(uuid.uuid4()))
        assert resp.status_code == 404


class TestGroupChat:
    create_url = "/api/v1/chat/new"

    def test_create_group_chat(self, auth_client, user, user2, user_factory):
        user3 = user_factory(username="groupuser3")
        resp = auth_client.post(self.create_url, {
            "name": "Test Group",
            "members": [str(user2.id), str(user3.id)],
        }, content_type="application/json")
        assert resp.status_code == 201
        assert resp.json()["success"] is True

    def test_create_group_requires_min_members(self, auth_client, user2):
        # Only 1 member (plus self = 2) but rule requires at least 2 OTHER members
        resp = auth_client.post(self.create_url, {
            "name": "Too Small",
            "members": [str(user2.id)],
        }, content_type="application/json")
        assert resp.status_code == 400

    def test_create_group_requires_name(self, auth_client, user2, user_factory):
        user3 = user_factory(username="g3")
        resp = auth_client.post(self.create_url, {
            "name": "",
            "members": [str(user2.id), str(user3.id)],
        }, content_type="application/json")
        assert resp.status_code == 400


class TestMyGroups:
    url = "/api/v1/chat/my-groups"

    def test_get_groups(self, auth_client, user, user2, user_factory):
        from apps.chat.models import Chat
        user3 = user_factory(username="grp_user")
        grp = Chat.objects.create(name="My Group", group_chat=True, creator=user)
        grp.members.add(user, user2, user3)
        grp.admins.add(user)

        resp = auth_client.get(self.url)
        assert resp.status_code == 200
        ids = [g["_id"] for g in resp.json()["groups"]]
        assert str(grp.id) in ids


class TestDeleteChat:
    def test_creator_can_delete_group(self, auth_client, user, user2, user_factory):
        from apps.chat.models import Chat
        user3 = user_factory(username="del_user")
        grp = Chat.objects.create(name="To Delete", group_chat=True, creator=user)
        grp.members.add(user, user2, user3)
        resp = auth_client.delete(f"/api/v1/chat/{grp.id}")
        assert resp.status_code == 200

    def test_non_creator_cannot_delete_group(self, auth_client2, user, user2, user_factory):
        from apps.chat.models import Chat
        user3 = user_factory(username="nd_user")
        grp = Chat.objects.create(name="Not Mine", group_chat=True, creator=user)
        grp.members.add(user, user2, user3)
        resp = auth_client2.delete(f"/api/v1/chat/{grp.id}")
        assert resp.status_code == 403


class TestAddRemoveMembers:
    def test_admin_can_add_member(self, auth_client, user, user2, user_factory):
        from apps.chat.models import Chat
        user3 = user_factory(username="new_mem")
        user4 = user_factory(username="add_target")
        grp = Chat.objects.create(name="Admin Test", group_chat=True, creator=user)
        grp.members.add(user, user2, user3)
        grp.admins.add(user)

        resp = auth_client.put("/api/v1/chat/add-members", {
            "chatId": str(grp.id),
            "members": [str(user4.id)],
        }, content_type="application/json")
        assert resp.status_code == 200

    def test_non_admin_cannot_add_member(self, auth_client2, user, user2, user_factory):
        from apps.chat.models import Chat
        user3 = user_factory(username="nm2")
        user4 = user_factory(username="t4")
        grp = Chat.objects.create(name="No Admin", group_chat=True, creator=user)
        grp.members.add(user, user2, user3)
        grp.admins.add(user)  # Only user is admin, not user2

        resp = auth_client2.put("/api/v1/chat/add-members", {
            "chatId": str(grp.id),
            "members": [str(user4.id)],
        }, content_type="application/json")
        assert resp.status_code == 403
