import os
import uuid
import hashlib
import shutil
import logging
from datetime import timedelta
from pathlib import Path
from django.utils import timezone
from django.conf import settings
from apps.storage_app.models import UploadSession, UploadChunk, UserStorageUsage
from .file_validator import sanitize_filename, validate_file_header
from .thumbnail_service import generate_image_thumbnail

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = int(os.environ.get("MAX_UPLOAD_SIZE", 100 * 1024 * 1024))  # 100MB default


class ChunkUploadService:
    @staticmethod
    def create_session(user, file_name: str, total_size: int, total_chunks: int, mime_type: str = "") -> tuple[bool, str, dict]:
        clean_name = sanitize_filename(file_name)
        is_valid_ext, err_ext = validate_file_header(b"", clean_name)
        if not is_valid_ext:
            return False, err_ext, {}

        if total_size > MAX_FILE_SIZE:
            return False, f"File exceeds maximum allowed size of {MAX_FILE_SIZE // (1024*1024)}MB.", {}

        # Check storage quota
        usage, _ = UserStorageUsage.objects.get_or_create(user=user)
        if usage.bytes_used + total_size > usage.quota_bytes:
            return False, "User storage quota exceeded.", {}

        storage_root = Path(settings.STORAGE_ROOT)
        session_id = uuid.uuid4()
        temp_dir = storage_root / "temporary" / str(session_id)
        temp_dir.mkdir(parents=True, exist_ok=True)

        session = UploadSession.objects.create(
            id=session_id,
            user=user,
            file_name=clean_name,
            total_size=total_size,
            total_chunks=max(1, total_chunks),
            mime_type=mime_type or "application/octet-stream",
            temp_dir=str(temp_dir),
            expires_at=timezone.now() + timedelta(hours=24),
            is_completed=False,
        )

        return True, "Upload session created.", {
            "session_id": str(session.id),
            "file_name": clean_name,
            "total_chunks": session.total_chunks,
        }

    @staticmethod
    def save_chunk(session_id: str, user, chunk_index: int, chunk_file) -> tuple[bool, str]:
        session = UploadSession.objects.filter(id=session_id, user=user, is_completed=False).first()
        if not session:
            return False, "Upload session not found or already completed."

        if timezone.now() > session.expires_at:
            return False, "Upload session expired."

        storage_root = Path(settings.STORAGE_ROOT).resolve()
        temp_root = (storage_root / "temporary").resolve()
        temp_dir = (temp_root / str(session.id)).resolve()
        if not temp_dir.is_relative_to(temp_root):
            return False, "Invalid temporary directory."

        safe_idx = int(chunk_index)
        if safe_idx < 0 or safe_idx >= max(1, session.total_chunks):
            return False, "Invalid chunk index."
        chunk_path = (temp_dir / f"chunk_{safe_idx}.part").resolve()
        if not chunk_path.is_relative_to(temp_dir):
            return False, "Invalid chunk path."

        # If chunk 0, validate magic header
        chunk_bytes = chunk_file.read()
        if chunk_index == 0:
            is_valid, msg = validate_file_header(chunk_bytes[:16], session.file_name)
            if not is_valid:
                return False, msg

        with open(chunk_path, "wb") as f:
            f.write(chunk_bytes)

        UploadChunk.objects.update_or_create(
            session=session,
            chunk_index=chunk_index,
            defaults={
                "chunk_size": len(chunk_bytes),
                "chunk_file_path": str(chunk_path),
                "is_verified": True,
            }
        )

        return True, f"Chunk {chunk_index} uploaded."

    @staticmethod
    def finalize_upload(session_id: str, user, expected_checksum: str = "") -> tuple[bool, str, dict]:
        session = UploadSession.objects.filter(id=session_id, user=user, is_completed=False).first()
        if not session:
            return False, "Upload session not found or already completed.", {}

        uploaded_chunks_count = session.chunks.count()
        if uploaded_chunks_count < session.total_chunks:
            return False, f"Missing chunks: {uploaded_chunks_count}/{session.total_chunks} received.", {}

        storage_root = Path(settings.STORAGE_ROOT).resolve()
        attachments_root = (storage_root / "attachments").resolve()
        attachments_dir = (attachments_root / str(user.id)).resolve()
        attachments_dir.mkdir(parents=True, exist_ok=True)

        ext = os.path.splitext(sanitize_filename(session.file_name))[1]
        unique_file_name = f"{session.id}_{uuid.uuid4().hex[:8]}{ext}"
        final_file_path = (attachments_dir / unique_file_name).resolve()
        if not final_file_path.is_relative_to(attachments_dir):
            return False, "Invalid attachment destination path.", {}

        hasher = hashlib.sha256()
        temp_root = (storage_root / "temporary").resolve()
        temp_dir = (temp_root / str(session.id)).resolve()
        if not temp_dir.is_relative_to(temp_root):
            return False, "Invalid temporary chunk directory.", {}

        # Stream chunks sequentially to destination file
        with open(final_file_path, "wb") as outfile:
            for i in range(session.total_chunks):
                chunk_file = (temp_dir / f"chunk_{i}.part").resolve()
                if not chunk_file.is_relative_to(temp_dir) or not chunk_file.exists():
                    return False, f"Missing chunk file {i}", {}
                with open(chunk_file, "rb") as infile:
                    while True:
                        buf = infile.read(65536)
                        if not buf:
                            break
                        outfile.write(buf)
                        hasher.update(buf)

        calculated_sha256 = hasher.hexdigest()
        if expected_checksum and expected_checksum.lower() != calculated_sha256.lower():
            final_file_path.unlink(missing_ok=True)
            return False, "Checksum verification failed. File corrupted during transit.", {}

        # Generate thumbnail for images
        thumbnail_dir = (storage_root / "thumbnails" / str(user.id)).resolve()
        thumb_path = ""
        if ext.lower() in (".jpg", ".jpeg", ".jfif", ".png", ".webp", ".gif"):
            thumb_full = generate_image_thumbnail(str(final_file_path), thumbnail_dir)
            if thumb_full:
                thumb_path = thumb_full

        # Update user storage usage
        actual_size = final_file_path.stat().st_size
        usage, _ = UserStorageUsage.objects.get_or_create(user=user)
        usage.bytes_used += actual_size
        usage.save(update_fields=["bytes_used"])

        # Update session
        session.is_completed = True
        session.checksum_sha256 = calculated_sha256
        session.final_path = str(final_file_path)
        session.save(update_fields=["is_completed", "checksum_sha256", "final_path"])

        # Clean up temporary chunk files
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass

        download_url = f"/api/v1/storage/file/{session.id}/"
        thumb_url = f"/api/v1/storage/file/{session.id}/thumb/" if thumb_path else ""

        return True, "Upload successfully assembled and verified.", {
            "session_id": str(session.id),
            "file_name": session.file_name,
            "file_size": actual_size,
            "mime_type": session.mime_type,
            "checksum_sha256": calculated_sha256,
            "url": download_url,
            "thumbnail_url": thumb_url,
        }
