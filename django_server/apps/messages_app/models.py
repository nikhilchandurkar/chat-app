import uuid
import os
from django.db import models
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding

from apps.authentication.models import User
from apps.chat.models import Chat


def get_encryption_key():
    key = os.environ.get("MESSAGE_ENCRYPTION_KEY", "12345678901234567890123456789012")
    return key.encode("utf-8")[:32].ljust(32, b"0")


def encrypt_message(text: str) -> str:
    if not text:
        return text
    if text.startswith("ENC:"):
        return text
    key = get_encryption_key()
    iv = os.urandom(16)
    padder = padding.PKCS7(128).padder()
    padded_data = padder.update(text.encode("utf-8")) + padder.finalize()
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    encryptor = cipher.encryptor()
    ct = encryptor.update(padded_data) + encryptor.finalize()
    return f"ENC:{iv.hex()}:{ct.hex()}"


def decrypt_message(text: str) -> str:
    if not text or not text.startswith("ENC:"):
        return text
    try:
        parts = text[4:].split(":")
        iv = bytes.fromhex(parts[0])
        ct = bytes.fromhex(parts[1])
        key = get_encryption_key()
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
        decryptor = cipher.decryptor()
        padded_data = decryptor.update(ct) + decryptor.finalize()
        unpadder = padding.PKCS7(128).unpadder()
        data = unpadder.update(padded_data) + unpadder.finalize()
        return data.decode("utf-8")
    except Exception:
        return "[Encrypted Message - Unable to Decrypt]"


# Dedicated ThreadPoolExecutor for offloading CPU-bound AES crypto from Daphne async event loop
from concurrent.futures import ThreadPoolExecutor
import asyncio

CRYPTO_EXECUTOR = ThreadPoolExecutor(
    max_workers=min(32, (os.cpu_count() or 1) * 2 + 4),
    thread_name_prefix="crypto_worker"
)

async def async_encrypt_message(text: str) -> str:
    if not text:
        return text
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(CRYPTO_EXECUTOR, encrypt_message, text)

async def async_decrypt_message(text: str) -> str:
    if not text:
        return text
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(CRYPTO_EXECUTOR, decrypt_message, text)


class Message(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sent_messages")
    chat = models.ForeignKey(Chat, on_delete=models.CASCADE, related_name="messages")
    content = models.TextField(blank=True, default="")
    attachments = models.JSONField(default=list, blank=True)
    reply_to = models.JSONField(null=True, blank=True)
    reactions = models.JSONField(default=list, blank=True)
    is_edited = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)
    read_by = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "messages"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["chat", "-created_at"]),
        ]

    def save(self, *args, **kwargs):
        if self.content and not self.content.startswith("ENC:"):
            self.content = encrypt_message(self.content)
        super().save(*args, **kwargs)

    @property
    def decrypted_content(self):
        if self.is_deleted:
            return "🚫 This message was deleted"
        return decrypt_message(self.content)

    def __str__(self):
        return f"Msg {self.id} from {self.sender.username} in {self.chat.name}"

