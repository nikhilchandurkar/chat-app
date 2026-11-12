"""
Reproducible Locust HTTP load test script exercising actual Chat App REST endpoints.
Example usage:
  .\load_testing\.venv\Scripts\locust -f load_testing\locustfile.py --headless -u 100 -r 10 -t 30s --host https://chat-nikkiii.duckdns.org
"""

from __future__ import annotations

import json
import os
import random
import uuid
from pathlib import Path

from locust import HttpUser, between, task


TOKENS_PATH = Path(
    os.environ.get(
        "LOADTEST_TOKENS_FILE",
        str(Path(__file__).resolve().parent / "results" / "test_users.json"),
    )
)
_USER_POOL: list[dict] = []
if TOKENS_PATH.exists():
    _USER_POOL = json.loads(TOKENS_PATH.read_text(encoding="utf-8"))
_USER_CURSOR = 0


def _next_user() -> dict | None:
    global _USER_CURSOR
    if not _USER_POOL:
        return None
    u = _USER_POOL[_USER_CURSOR % len(_USER_POOL)]
    _USER_CURSOR += 1
    return u


class ChatHttpUser(HttpUser):
    wait_time = between(0.5, 2.0)

    def on_start(self) -> None:
        self.account = _next_user()
        self.headers: dict[str, str] = {}
        self.chat_id: str | None = None
        if self.account:
            self.headers = {"Authorization": f"Bearer {self.account['access_token']}"}
            self.chat_id = self.account.get("direct_chat_id")

    @task(4)
    def get_my_chats(self) -> None:
        if not self.headers:
            return
        self.client.get("/api/v1/chat/my", headers=self.headers, name="/api/v1/chat/my")

    @task(4)
    def get_message_history(self) -> None:
        if not self.headers or not self.chat_id:
            return
        self.client.get(
            f"/api/v1/chat/message/{self.chat_id}?page=1&limit=25",
            headers=self.headers,
            name="/api/v1/chat/message/:id",
        )

    @task(2)
    def send_rest_message(self) -> None:
        if not self.headers or not self.chat_id:
            return
        self.client.post(
            "/api/v1/message/send",
            json={
                "chatId": self.chat_id,
                "message": f"Locust ping {uuid.uuid4().hex[:8]}",
                "client_message_id": uuid.uuid4().hex,
            },
            headers=self.headers,
            name="/api/v1/message/send",
        )

    @task(2)
    def get_profile(self) -> None:
        if not self.headers:
            return
        self.client.get("/api/v1/user/me", headers=self.headers, name="/api/v1/user/me")

    @task(1)
    def search_users(self) -> None:
        if not self.headers:
            return
        suffix = f"{random.randint(1, 50):05d}"
        self.client.get(
            f"/api/v1/user/search?name=lt_user_{suffix}",
            headers=self.headers,
            name="/api/v1/user/search",
        )

    @task(1)
    def get_groups_and_notifications(self) -> None:
        if not self.headers:
            return
        self.client.get("/api/v1/chat/my/groups", headers=self.headers, name="/api/v1/chat/my/groups")
        self.client.get("/api/v1/user/notifications", headers=self.headers, name="/api/v1/user/notifications")

    @task(1)
    def get_storage_quota(self) -> None:
        if not self.headers:
            return
        self.client.get("/api/v1/storage/quota", headers=self.headers, name="/api/v1/storage/quota")

