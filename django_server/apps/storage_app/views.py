import os
import re
import mimetypes
from pathlib import Path
from django.http import HttpResponse, StreamingHttpResponse, Http404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from apps.storage_app.models import UploadSession, UserStorageUsage
from apps.authentication.throttles import FileUploadThrottle
from .services.chunk_service import ChunkUploadService
from .services.file_validator import sanitize_filename, validate_file_header


class RangeFileWrapper:
    """Streams a portion of a file defined by Range bytes."""
    def __init__(self, file_path, offset=0, length=None, chunk_size=65536):
        self.file_path = file_path
        self.offset = offset
        self.length = length
        self.chunk_size = chunk_size

    def __iter__(self):
        with open(self.file_path, "rb") as f:
            f.seek(self.offset)
            remaining = self.length
            while remaining is None or remaining > 0:
                read_size = self.chunk_size if remaining is None else min(self.chunk_size, remaining)
                data = f.read(read_size)
                if not data:
                    break
                if remaining is not None:
                    remaining -= len(data)
                yield data


class CreateUploadSessionView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [FileUploadThrottle]

    def post(self, request):
        file_name = request.data.get("file_name", "file")
        total_size = int(request.data.get("total_size", 0))
        total_chunks = int(request.data.get("total_chunks", 1))
        mime_type = request.data.get("mime_type", "")

        # User quota validation
        usage, _ = UserStorageUsage.objects.get_or_create(user=request.user)
        if usage.bytes_used + total_size > usage.quota_bytes:
            return Response({
                "success": False,
                "message": f"Storage quota exceeded ({usage.bytes_used // (1024*1024)}MB / {usage.quota_bytes // (1024*1024)}MB used)."
            }, status=status.HTTP_400_BAD_REQUEST)

        success, msg, data = ChunkUploadService.create_session(
            user=request.user,
            file_name=file_name,
            total_size=total_size,
            total_chunks=total_chunks,
            mime_type=mime_type,
        )
        if not success:
            return Response({"success": False, "message": msg}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"success": True, "message": msg, **data})


class UploadChunkView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        session_id = request.data.get("session_id")
        chunk_index = int(request.data.get("chunk_index", 0))
        chunk_file = request.FILES.get("chunk")

        if not session_id or not chunk_file:
            return Response({"success": False, "message": "session_id and chunk file are required."}, status=status.HTTP_400_BAD_REQUEST)

        success, msg = ChunkUploadService.save_chunk(
            session_id=session_id,
            user=request.user,
            chunk_index=chunk_index,
            chunk_file=chunk_file,
        )
        if not success:
            return Response({"success": False, "message": msg}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"success": True, "message": msg})


class CompleteUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        session_id = request.data.get("session_id")
        expected_checksum = request.data.get("checksum_sha256", "")

        if not session_id:
            return Response({"success": False, "message": "session_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        success, msg, data = ChunkUploadService.finalize_upload(
            session_id=session_id,
            user=request.user,
            expected_checksum=expected_checksum,
        )
        if not success:
            return Response({"success": False, "message": msg}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"success": True, "message": msg, "file": data})


class DirectMultipartUploadView(APIView):
    """Direct single-request multipart upload for standard attachments."""
    permission_classes = [IsAuthenticated]
    throttle_classes = [FileUploadThrottle]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"success": False, "message": "No file attached."}, status=status.HTTP_400_BAD_REQUEST)

        file_name = sanitize_filename(uploaded_file.name)
        total_size = uploaded_file.size

        # User quota validation
        usage, _ = UserStorageUsage.objects.get_or_create(user=request.user)
        if usage.bytes_used + total_size > usage.quota_bytes:
            return Response({
                "success": False,
                "message": f"Storage quota exceeded ({usage.bytes_used // (1024*1024)}MB / {usage.quota_bytes // (1024*1024)}MB used)."
            }, status=status.HTTP_400_BAD_REQUEST)

        header_bytes = uploaded_file.read(16)
        uploaded_file.seek(0)
        valid, err_msg = validate_file_header(header_bytes, file_name)
        if not valid:
            return Response({"success": False, "message": err_msg}, status=status.HTTP_400_BAD_REQUEST)
        mime_type = uploaded_file.content_type or mimetypes.guess_type(file_name)[0] or "application/octet-stream"

        # Create session
        ok, msg, session_data = ChunkUploadService.create_session(
            user=request.user,
            file_name=file_name,
            total_size=total_size,
            total_chunks=1,
            mime_type=mime_type,
        )
        if not ok:
            return Response({"success": False, "message": msg}, status=status.HTTP_400_BAD_REQUEST)

        session_id = session_data["session_id"]
        # Save chunk
        ok, msg = ChunkUploadService.save_chunk(
            session_id=session_id,
            user=request.user,
            chunk_index=0,
            chunk_file=uploaded_file,
        )
        if not ok:
            return Response({"success": False, "message": msg}, status=status.HTTP_400_BAD_REQUEST)

        # Finalize
        ok, msg, data = ChunkUploadService.finalize_upload(session_id=session_id, user=request.user)
        if not ok:
            return Response({"success": False, "message": msg}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"success": True, "message": "Uploaded successfully.", "file": data})


class StreamDownloadView(APIView):
    """
    Authenticated streaming download with HTTP Range request support.
    Serves files safely without leaking absolute file paths.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, session_id):
        session = UploadSession.objects.filter(id=session_id, is_completed=True).first()
        if not session or not session.final_path:
            raise Http404("File not found")

        # Security: verify user is owner or is a member of the conversation this file belongs to
        user = request.user
        if session.user != user:
            from apps.messages_app.models import MessageAttachment
            from django.utils import timezone
            # Check if attachment belongs to a conversation user is member of and has not expired
            att = MessageAttachment.objects.filter(
                file_path=session.final_path,
                message__conversation__member_records__user=user
            ).select_related("message").first()

            if not att and not user.is_staff:
                return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

            # Ephemeral / Disappearing message check
            if att and att.message.expires_at and timezone.now() > att.message.expires_at:
                raise Http404("File has expired per disappearing message policy.")

        # Path traversal prevention: verify final_path is inside STORAGE_ROOT
        from django.conf import settings
        storage_root = Path(settings.STORAGE_ROOT).resolve()
        target_path = Path(session.final_path).resolve()
        if not str(target_path).startswith(str(storage_root)):
            return Response({"success": False, "message": "Invalid storage path detected."}, status=status.HTTP_403_FORBIDDEN)

        file_path = str(target_path)
        if not os.path.exists(file_path):
            raise Http404("File missing on disk")

        file_size = os.path.getsize(file_path)
        content_type = session.mime_type or "application/octet-stream"

        range_header = request.META.get("HTTP_RANGE", "").strip()
        range_match = re.match(r"^bytes=(\d+)-(\d+)?$", range_header)

        if range_match:
            first_byte = int(range_match.group(1))
            last_byte = int(range_match.group(2)) if range_match.group(2) else file_size - 1
            length = last_byte - first_byte + 1

            resp = StreamingHttpResponse(
                RangeFileWrapper(file_path, offset=first_byte, length=length),
                status=206,
                content_type=content_type,
            )
            resp["Content-Range"] = f"bytes {first_byte}-{last_byte}/{file_size}"
            resp["Content-Length"] = str(length)
        else:
            resp = StreamingHttpResponse(
                RangeFileWrapper(file_path, offset=0, length=file_size),
                content_type=content_type,
            )
            resp["Content-Length"] = str(file_size)

        resp["Accept-Ranges"] = "bytes"
        # Prevent executing active scripts or inline HTML in the application origin
        is_safe_media = content_type.startswith(("image/", "video/", "audio/")) and "svg" not in content_type and "html" not in content_type
        disposition = "inline" if is_safe_media else "attachment"
        resp["Content-Disposition"] = f'{disposition}; filename="{sanitize_filename(session.file_name)}"'
        resp["X-Content-Type-Options"] = "nosniff"
        resp["Content-Security-Policy"] = "default-src 'none'"
        return resp


class StreamThumbnailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, session_id):
        session = UploadSession.objects.filter(id=session_id, is_completed=True).first()
        if not session or not session.final_path:
            raise Http404("Thumbnail not found")

        # Locate thumbnail in thumbnails directory
        from pathlib import Path
        from django.conf import settings
        storage_root = Path(settings.STORAGE_ROOT)
        thumb_dir = storage_root / "thumbnails" / str(session.user_id)
        base_name = os.path.basename(session.final_path)
        thumb_name = f"thumb_{os.path.splitext(base_name)[0]}.jpg"
        thumb_path = thumb_dir / thumb_name

        if not thumb_path.exists():
            # If thumbnail not present, serve full image
            return StreamDownloadView.as_view()(request._request, session_id=session_id)

        with open(thumb_path, "rb") as f:
            data = f.read()

        resp = HttpResponse(data, content_type="image/jpeg")
        resp["Cache-Control"] = "public, max-age=86400"
        return resp


class UserStorageQuotaView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        usage, _ = UserStorageUsage.objects.get_or_create(user=request.user)
        return Response({
            "success": True,
            "bytes_used": usage.bytes_used,
            "quota_bytes": usage.quota_bytes,
            "used_mb": round(usage.bytes_used / (1024 * 1024), 2),
            "quota_mb": round(usage.quota_bytes / (1024 * 1024), 2),
            "percentage": round((usage.bytes_used / usage.quota_bytes) * 100, 2) if usage.quota_bytes else 0,
        })
