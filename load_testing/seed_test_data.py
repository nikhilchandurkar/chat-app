"""
Seeds and cleans up isolated synthetic benchmark users, conversations, and initial messages
in `chat_db` over SSH-tunneled PyMySQL, without disturbing production users.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from db_manager import open_mysql_tunnel


LOADTEST_EMAIL_DOMAIN = "@loadtest.local"
DEFAULT_PASSWORD_PLAIN = "LoadTestPass2026!"


def _make_fast_password_hash(password: str, rounds: int = 10) -> str:
    """Computes salted PBKDF2-SHA256 hash compatible with Django PBKDF2PasswordHasher."""
    salt = secrets.token_hex(12)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 260000)
    b64_hash = base64.b64encode(dk).decode("ascii").strip()
    return f"pbkdf2_sha256$260000${salt}${b64_hash}"


def _make_jwt_pair(secret_key: str, user_uuid: str, refresh_jti: str | None = None) -> tuple[str, str, str]:
    """Mints HS256 JWT access & refresh tokens matching SimpleJWT defaults cleanly."""
    import hmac

    now = int(datetime.now(timezone.utc).timestamp())
    jti_access = uuid.uuid4().hex
    jti_refresh = refresh_jti or uuid.uuid4().hex

    def _b64url(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")

    header = _b64url(json.dumps({"typ": "JWT", "alg": "HS256"}, separators=(",", ":")).encode())

    def _sign(payload: dict) -> str:
        body = _b64url(json.dumps(payload, separators=(",", ":")).encode())
        msg = f"{header}.{body}".encode("ascii")
        sig = hmac.new(secret_key.encode("utf-8"), msg, hashlib.sha256).digest()
        return f"{header}.{body}.{_b64url(sig)}"

    access = _sign({
        "token_type": "access",
        "exp": now + 86400,  # 24h for long test sweeps
        "iat": now,
        "jti": jti_access,
        "user_id": user_uuid,
    })
    refresh = _sign({
        "token_type": "refresh",
        "exp": now + 30 * 86400,
        "iat": now,
        "jti": jti_refresh,
        "user_id": user_uuid,
    })
    return access, refresh, jti_refresh


def _encrypt_msg(text: str, enc_key: str) -> str:
    key = enc_key.encode("utf-8")[:32].ljust(32, b"0")
    iv = os.urandom(16)
    padder = padding.PKCS7(128).padder()
    padded = padder.update(text.encode("utf-8")) + padder.finalize()
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    encryptor = cipher.encryptor()
    ct = encryptor.update(padded) + encryptor.finalize()
    return f"ENC:{iv.hex()}:{ct.hex()}"


def _fetch_ec2_app_secrets(
    ssh_host: str = "13.203.33.175",
    ssh_user: str = "ubuntu",
    ssh_key: str = r"D:\personal\chat_app_server.pem",
) -> tuple[str, str]:
    import subprocess

    cmd = [
        "ssh",
        "-o",
        "BatchMode=yes",
        "-i",
        ssh_key,
        f"{ssh_user}@{ssh_host}",
        "docker exec chat_django_daphne python -c 'from django.conf import settings; import os; print(settings.SECRET_KEY); print(os.environ.get(\"MESSAGE_ENCRYPTION_KEY\", \"12345678901234567890123456789012\"))'",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=20)
    lines = res.stdout.splitlines()
    if len(lines) < 2:
        raise RuntimeError("Could not retrieve backend signing/encryption keys for load-test seeding.")
    return lines[0].strip(), lines[1].strip()


def seed_users_and_chats(
    count: int,
    tokens_out: Path,
    messages_per_chat: int = 10,
    group_size: int = 10,
) -> dict:
    """Seeds up to `count` load-test users, paired direct chats, group chats, and sample messages."""
    secret_key, enc_key = _fetch_ec2_app_secrets()
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    pw_hash = _make_fast_password_hash(DEFAULT_PASSWORD_PLAIN)

    users_meta: list[dict] = []

    with open_mysql_tunnel(database="chat_db") as conn:
        # Django UUIDField on MySQL is stored as CHAR(32) hex
        with conn.cursor() as cur:
            if pw_hash.startswith("bcrypt_sha256$"):
                cur.execute(
                    "UPDATE users SET password = %s WHERE email LIKE %s AND password NOT LIKE 'bcrypt_sha256%%'",
                    (pw_hash, f"%{LOADTEST_EMAIL_DOMAIN}"),
                )
            # Clear prior synthetic benchmark sessions so each benchmark starts with clean device slots
            cur.execute(
                """
                DELETE rt FROM refresh_tokens rt
                JOIN users u ON u.id = rt.user_id
                WHERE u.email LIKE %s
                """,
                (f"%{LOADTEST_EMAIL_DOMAIN}",),
            )
            cur.execute(
                """
                DELETE us FROM user_sessions us
                JOIN users u ON u.id = us.user_id
                WHERE u.email LIKE %s
                """,
                (f"%{LOADTEST_EMAIL_DOMAIN}",),
            )
            cur.execute(
                "SELECT id, username, email FROM users WHERE email LIKE %s ORDER BY username ASC",
                (f"%{LOADTEST_EMAIL_DOMAIN}",),
            )
            existing_rows = cur.fetchall()
            existing_by_uname = {r["username"]: r["id"] for r in existing_rows}

            new_users = []
            new_profiles = []
            for idx in range(1, count + 1):
                uname = f"lt_user_{idx:05d}"
                email = f"{uname}{LOADTEST_EMAIL_DOMAIN}"
                if uname in existing_by_uname:
                    uid_char32 = existing_by_uname[uname]
                else:
                    uid_char32 = uuid.uuid4().hex
                    new_users.append((
                        uid_char32,
                        pw_hash,
                        email,
                        uname,
                        f"Load User {idx:05d}",
                        "Benchmark account",
                        "{}",
                        "offline",
                        '{"profile":"everyone"}',
                        "user",
                        "[]",
                        1,
                        0,
                        0,
                        now_str,
                        now_str,
                    ))
                    new_profiles.append((
                        uid_char32,
                        f"Load User {idx:05d}",
                        "",
                        "",
                        "offline",
                        now_str,
                        "everyone",
                        "everyone",
                        "everyone",
                        0,
                        1,
                        1,
                        "everyone",
                        "everyone",
                        now_str,
                        now_str,
                    ))
                users_meta.append({
                    "id": str(uuid.UUID(uid_char32)),
                    "id_hex": uid_char32,
                    "username": uname,
                    "email": email,
                })

            batch_size = 500
            for start in range(0, len(new_users), batch_size):
                cur.executemany(
                    """
                    INSERT INTO users (
                        id, password, email, username, name, bio, avatar, status, privacy,
                        role, starred_messages, is_active, is_staff, is_superuser, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    new_users[start : start + batch_size],
                )
                cur.executemany(
                    """
                    INSERT INTO user_profiles (
                        user_id, display_name, avatar_url, about, online_status, last_seen,
                        privacy_avatar, privacy_online, privacy_last_seen, hide_from_search,
                        privacy_read_receipts, privacy_typing_indicator,
                        who_can_add_to_groups, who_can_message_me, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    new_profiles[start : start + batch_size],
                )

            # Seed paired 1-to-1 chats: (0,1), (2,3), ...
            cur.execute(
                """
                SELECT c.id, cm.user_id
                FROM conversations c
                JOIN conversation_members cm ON cm.conversation_id = c.id
                JOIN users u ON u.id = cm.user_id
                WHERE c.type = 'direct' AND u.email LIKE %s
                """,
                (f"%{LOADTEST_EMAIL_DOMAIN}",),
            )
            user_direct_chat: dict[str, str] = {}
            for row in cur.fetchall():
                user_direct_chat.setdefault(row["user_id"], row["id"])

            convs_to_add = []
            members_to_add = []
            msgs_to_add = []
            sample_ct = _encrypt_msg("Baseline load-test history message", enc_key)

            for i in range(0, len(users_meta) - 1, 2):
                u1 = users_meta[i]
                u2 = users_meta[i + 1]
                chat_hex = user_direct_chat.get(u1["id_hex"])
                if not chat_hex:
                    chat_hex = uuid.uuid4().hex
                    convs_to_add.append((
                        chat_hex, "", "direct", 0, u1["id_hex"], "{}", 0, "[]", 0, 0, now_str, now_str
                    ))
                    members_to_add.append((uuid.uuid4().hex, chat_hex, u1["id_hex"], "member", now_str, 0, None, 0, 0, "", 0))
                    members_to_add.append((uuid.uuid4().hex, chat_hex, u2["id_hex"], "member", now_str, 0, None, 0, 0, "", 0))
                    # Add initial messages only on first ~200 pairs to keep EC2 root disk lean
                    if i < 400:
                        for m_idx in range(messages_per_chat):
                            ts = (datetime.now(timezone.utc) - timedelta(minutes=messages_per_chat - m_idx)).strftime("%Y-%m-%d %H:%M:%S")
                            sender_hex = u1["id_hex"] if m_idx % 2 == 0 else u2["id_hex"]
                            msgs_to_add.append((
                                uuid.uuid4().hex, chat_hex, sender_hex, "", "text", sample_ct,
                                "[]", None, "[]", 0, 0, "sent", "[]", None, None, ts, ts
                            ))
                chat_uuid = str(uuid.UUID(chat_hex))
                u1["direct_chat_id"] = chat_uuid
                u2["direct_chat_id"] = chat_uuid
                u1["peer_id"] = u2["id"]
                u2["peer_id"] = u1["id"]

            # Seed small set of multi-user group chats for group fanout benchmarks
            cur.execute("SELECT id, name FROM conversations WHERE type='group' AND name LIKE 'LT_Group_%'")
            existing_groups = {r["name"]: r["id"] for r in cur.fetchall()}

            num_groups = min(50, max(1, count // group_size))
            for g_idx in range(num_groups):
                g_name = f"LT_Group_{g_idx:03d}"
                group_slice = users_meta[g_idx * group_size : (g_idx + 1) * group_size]
                if len(group_slice) < 2:
                    continue
                if g_name in existing_groups:
                    g_hex = existing_groups[g_name]
                else:
                    g_hex = uuid.uuid4().hex
                    convs_to_add.append((
                        g_hex, g_name, "group", 1, group_slice[0]["id_hex"], "{}", 0, "[]", 0, 0, now_str, now_str
                    ))
                    for pos, gm in enumerate(group_slice):
                        role = "owner" if pos == 0 else "member"
                        members_to_add.append((uuid.uuid4().hex, g_hex, gm["id_hex"], role, now_str, 0, None, 0, 0, "", 0))
                g_uuid = str(uuid.UUID(g_hex))
                for gm in group_slice:
                    gm["group_chat_id"] = g_uuid

            for start in range(0, len(convs_to_add), batch_size):
                cur.executemany(
                    """
                    INSERT INTO conversations (
                        id, name, type, group_chat, creator_id, avatar, restricted_messages,
                        pinned_messages, ephemeral_ttl, is_archived, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    convs_to_add[start : start + batch_size],
                )
            for start in range(0, len(members_to_add), batch_size):
                cur.executemany(
                    """
                    INSERT INTO conversation_members (
                        id, conversation_id, user_id, role, joined_at, is_muted, mute_until,
                        is_archived, is_pinned, last_read_message_id, unread_count
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    members_to_add[start : start + batch_size],
                )
            for start in range(0, len(msgs_to_add), batch_size):
                cur.executemany(
                    """
                    INSERT INTO messages (
                        id, conversation_id, sender_id, client_message_id, message_type, content,
                        attachments, reply_to, reactions, is_edited, is_deleted, status,
                        read_by, scheduled_for, expires_at, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    msgs_to_add[start : start + batch_size],
                )

        conn.commit()

    # Mint valid JWT tokens locally for all users without overloading EC2 before the test
    for u in users_meta:
        acc, ref, _ = _make_jwt_pair(secret_key, u["id"])
        u["access_token"] = acc
        u["refresh_token"] = ref
        u["password"] = DEFAULT_PASSWORD_PLAIN

    tokens_out.parent.mkdir(parents=True, exist_ok=True)
    tokens_out.write_text(json.dumps(users_meta), encoding="utf-8")

    return {
        "total_users_ready": len(users_meta),
        "newly_created_users": len(new_users),
        "newly_created_chats": len(convs_to_add),
        "newly_created_messages": len(msgs_to_add),
        "tokens_file": str(tokens_out),
    }


def cleanup_test_data() -> dict:
    """Removes synthetic `@loadtest.local` accounts, test groups/messages, and outbox rows cleanly."""
    with open_mysql_tunnel(database="chat_db") as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email LIKE %s", (f"%{LOADTEST_EMAIL_DOMAIN}",))
            user_ids = [r["id"] for r in cur.fetchall()]
            if not user_ids:
                return {"deleted_users": 0, "deleted_conversations": 0}

            cur.execute(
                "SELECT DISTINCT conversation_id FROM conversation_members WHERE user_id IN (%s)"
                % ",".join(["%s"] * len(user_ids)),
                user_ids,
            )
            conv_ids = [r["conversation_id"] for r in cur.fetchall()]

            if conv_ids:
                for start in range(0, len(conv_ids), 500):
                    chunk = conv_ids[start : start + 500]
                    ph = ",".join(["%s"] * len(chunk))
                    conv_uuids = [str(uuid.UUID(c)) for c in chunk]
                    cur.execute(f"DELETE FROM message_outbox WHERE conversation_id IN ({ph})", conv_uuids)
                    cur.execute(f"DELETE FROM conversations WHERE id IN ({ph})", chunk)

            for start in range(0, len(user_ids), 500):
                chunk = user_ids[start : start + 500]
                ph = ",".join(["%s"] * len(chunk))
                cur.execute(f"DELETE FROM users WHERE id IN ({ph})", chunk)

        conn.commit()
    return {"deleted_users": len(user_ids), "deleted_conversations": len(conv_ids)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed or cleanup isolated load-test dataset in chat_db.")
    parser.add_argument("--count", type=int, default=1000, help="Number of synthetic users to ensure exist.")
    parser.add_argument("--messages-per-chat", type=int, default=10)
    parser.add_argument("--tokens-out", default=str(Path(__file__).resolve().parent / "results" / "test_users.json"))
    parser.add_argument("--cleanup", action="store_true", help="Remove all synthetic @loadtest.local data.")
    args = parser.parse_args()

    if args.cleanup:
        print(json.dumps(cleanup_test_data(), indent=2))
    else:
        print(json.dumps(seed_users_and_chats(args.count, Path(args.tokens_out), args.messages_per_chat), indent=2))

