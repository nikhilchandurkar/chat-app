"""
Root conftest.py – shared fixtures for the entire test suite.
Force SQLite for all tests (fast, no external service required).
"""

import os
import django
import pytest

# Force SQLite for tests before Django setup
os.environ.setdefault("DB_ENGINE", "sqlite3")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
os.environ.setdefault("DEBUG", "True")
os.environ.setdefault("USE_REDIS", "False")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")
os.environ.setdefault("MESSAGE_ENCRYPTION_KEY", "12345678901234567890123456789012")




# ── User factories ────────────────────────────────────────────────────────────

@pytest.fixture
def user_factory(db):
    """Return a callable that creates User instances with sensible defaults."""
    from apps.authentication.models import User

    def _make(username=None, email=None, password="TestPass123!", **kwargs):
        import uuid
        suffix = uuid.uuid4().hex[:6]
        username = username or f"testuser_{suffix}"
        email = email or f"{username}@example.com"
        user = User.objects.create_user(
            username=username,
            email=email,
            name=kwargs.pop("name", username.capitalize()),
            password=password,
            **kwargs,
        )
        return user

    return _make


@pytest.fixture
def user(user_factory):
    return user_factory()


@pytest.fixture
def user2(user_factory):
    return user_factory(username="other_user", email="other@example.com")


@pytest.fixture
def admin_user(user_factory):
    return user_factory(username="admin_user", email="admin@example.com", role="admin", is_staff=True)


# ── JWT helpers ───────────────────────────────────────────────────────────────

@pytest.fixture
def auth_token(user):
    from rest_framework_simplejwt.tokens import RefreshToken
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token)


@pytest.fixture
def auth_client(client, auth_token):
    """Django test client with Authorization header pre-set."""
    client.defaults["HTTP_AUTHORIZATION"] = f"Bearer {auth_token}"
    return client


@pytest.fixture
def auth_client2(client, user2):
    from rest_framework_simplejwt.tokens import RefreshToken
    token = str(RefreshToken.for_user(user2).access_token)
    client.defaults["HTTP_AUTHORIZATION"] = f"Bearer {token}"
    return client


# ── Chat fixture ──────────────────────────────────────────────────────────────

@pytest.fixture
def direct_chat(db, user, user2):
    from apps.chat.models import Chat
    chat = Chat.objects.create(name="Test DM", group_chat=False)
    chat.members.add(user, user2)
    return chat
