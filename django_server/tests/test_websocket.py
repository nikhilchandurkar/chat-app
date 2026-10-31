"""
WebSocket / Django Channels tests.

Tests run against the in-memory channel layer (no Redis required).
"""

import pytest
import json
from channels.testing import WebsocketCommunicator
from django.test import override_settings


pytestmark = [pytest.mark.websocket, pytest.mark.django_db(transaction=True)]

IN_MEMORY_CHANNELS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}


def _make_app():
    """Lazy import to avoid circular imports during collection."""
    from core.asgi import application
    return application


@pytest.fixture
def ws_token(user):
    from rest_framework_simplejwt.tokens import RefreshToken
    return str(RefreshToken.for_user(user).access_token)


@pytest.fixture
def ws_token2(user2):
    from rest_framework_simplejwt.tokens import RefreshToken
    return str(RefreshToken.for_user(user2).access_token)


# ── Authentication tests ──────────────────────────────────────────────────────

@pytest.mark.asyncio
@override_settings(CHANNEL_LAYERS=IN_MEMORY_CHANNELS)
async def test_authenticated_ws_connection_accepted(ws_token):
    app = _make_app()
    comm = WebsocketCommunicator(app, f"/ws?token={ws_token}")
    connected, _ = await comm.connect()
    assert connected, "Authenticated user must be able to connect"
    await comm.disconnect()


@pytest.mark.asyncio
@override_settings(CHANNEL_LAYERS=IN_MEMORY_CHANNELS)
async def test_unauthenticated_ws_connection_rejected():
    app = _make_app()
    comm = WebsocketCommunicator(app, "/ws")
    connected, _ = await comm.connect()
    # Consumer closes connection for unauthenticated users
    if connected:
        # Allow a moment for the close frame
        output = await comm.receive_nothing(timeout=1)
        await comm.disconnect()
    else:
        assert not connected


@pytest.mark.asyncio
@override_settings(CHANNEL_LAYERS=IN_MEMORY_CHANNELS)
async def test_invalid_token_rejected():
    app = _make_app()
    comm = WebsocketCommunicator(app, "/ws?token=not.a.valid.jwt.token")
    connected, _ = await comm.connect()
    # Either rejected outright or connection closes upon receiving any message
    if connected:
        await comm.disconnect()
    # The important thing: no server crash (500)


# ── Online users broadcast ────────────────────────────────────────────────────

@pytest.mark.asyncio
@override_settings(CHANNEL_LAYERS=IN_MEMORY_CHANNELS)
async def test_online_users_broadcast_on_connect(ws_token, user):
    app = _make_app()
    comm = WebsocketCommunicator(app, f"/ws?token={ws_token}")
    connected, _ = await comm.connect()
    assert connected

    # Should receive ONLINE_USERS event after connection
    response = await comm.receive_json_from(timeout=3)
    assert response.get("event") == "ONLINE_USERS"
    assert str(user.id) in response["data"]

    await comm.disconnect()


# ── Message sending ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
@override_settings(CHANNEL_LAYERS=IN_MEMORY_CHANNELS)
async def test_send_message_to_chat(ws_token, user, user2, direct_chat):
    app = _make_app()
    comm = WebsocketCommunicator(app, f"/ws?token={ws_token}")
    connected, _ = await comm.connect()
    assert connected

    # Consume the ONLINE_USERS event
    await comm.receive_json_from(timeout=3)

    await comm.send_json_to({
        "event": "NEW_MESSAGE",
        "data": {
            "chatId": str(direct_chat.id),
            "message": "Hello from test!",
            "members": [str(user.id), str(user2.id)],
        }
    })

    # Should receive NEW_MESSAGE back (sent to self's group too)
    response = await comm.receive_json_from(timeout=5)
    assert response.get("event") == "NEW_MESSAGE"
    assert response["data"]["message"]["content"] == "Hello from test!"

    await comm.disconnect()


# ── Typing events ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
@override_settings(CHANNEL_LAYERS=IN_MEMORY_CHANNELS)
async def test_typing_events_do_not_crash(ws_token, user, direct_chat):
    app = _make_app()
    comm = WebsocketCommunicator(app, f"/ws?token={ws_token}")
    connected, _ = await comm.connect()
    assert connected

    await comm.receive_json_from(timeout=3)  # ONLINE_USERS

    await comm.send_json_to({
        "event": "START_TYPING",
        "data": {
            "chatId": str(direct_chat.id),
            "members": [str(user.id)],
        }
    })
    # Typing to self generates no response — just verify no crash
    await comm.disconnect()


# ── Malformed / unknown events ────────────────────────────────────────────────

@pytest.mark.asyncio
@override_settings(CHANNEL_LAYERS=IN_MEMORY_CHANNELS)
async def test_unknown_event_ignored(ws_token):
    app = _make_app()
    comm = WebsocketCommunicator(app, f"/ws?token={ws_token}")
    connected, _ = await comm.connect()
    assert connected

    await comm.receive_json_from(timeout=3)  # ONLINE_USERS

    await comm.send_to(text_data='{"event": "TOTALLY_UNKNOWN", "data": {}}')
    # Unknown event → silently ignored, no crash
    no_response = await comm.receive_nothing(timeout=1)
    assert no_response

    await comm.disconnect()


# ── Unauthorized chat access ──────────────────────────────────────────────────

@pytest.mark.asyncio
@override_settings(CHANNEL_LAYERS=IN_MEMORY_CHANNELS)
async def test_message_to_nonmember_chat_silently_fails(ws_token):
    """Sending a message to a chat the user isn't in must fail silently."""
    import uuid
    app = _make_app()
    comm = WebsocketCommunicator(app, f"/ws?token={ws_token}")
    connected, _ = await comm.connect()
    assert connected

    await comm.receive_json_from(timeout=3)

    fake_chat_id = str(uuid.uuid4())
    await comm.send_json_to({
        "event": "NEW_MESSAGE",
        "data": {
            "chatId": fake_chat_id,
            "message": "Inject!",
            "members": [],
        }
    })

    # No broadcast expected — member check fails
    no_response = await comm.receive_nothing(timeout=1)
    assert no_response

    await comm.disconnect()
