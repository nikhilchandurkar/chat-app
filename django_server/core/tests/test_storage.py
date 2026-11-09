import io
from django.test import TestCase
from rest_framework.test import APIClient
from apps.authentication.models import User
from apps.storage_app.models import UploadSession


class StorageTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(email="storage_user@example.com", username="storageuser")
        self.client.force_authenticate(user=self.user)

    def test_chunked_upload_and_download_flow(self):
        file_bytes = b"Hello world! This is a private test document attachment."
        file_size = len(file_bytes)

        # 1. Create upload session
        resp_session = self.client.post("/api/v1/storage/upload/session", {
            "file_name": "document.txt",
            "total_size": file_size,
            "total_chunks": 1,
            "mime_type": "text/plain",
        })
        self.assertEqual(resp_session.status_code, 200)
        session_id = resp_session.data["session_id"]

        # 2. Upload chunk
        chunk_file = io.BytesIO(file_bytes)
        chunk_file.name = "document.part"
        resp_chunk = self.client.post("/api/v1/storage/upload/chunk", {
            "session_id": session_id,
            "chunk_index": 0,
            "chunk": chunk_file,
        }, format="multipart")
        self.assertEqual(resp_chunk.status_code, 200)

        # 3. Finalize upload
        resp_complete = self.client.post("/api/v1/storage/upload/complete", {
            "session_id": session_id,
        })
        self.assertEqual(resp_complete.status_code, 200)
        file_data = resp_complete.data["file"]
        self.assertEqual(file_data["file_size"], file_size)

        # 4. Stream download
        resp_download = self.client.get(f"/api/v1/storage/file/{session_id}")
        self.assertEqual(resp_download.status_code, 200)
        content = b"".join(resp_download.streaming_content)
        self.assertEqual(content, file_bytes)

    def test_blocked_dangerous_extension(self):
        f = io.BytesIO(b"malicious script")
        f.name = "payload.exe"
        resp = self.client.post("/api/v1/storage/upload", {
            "file": f,
        }, format="multipart")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("prohibited", resp.data["message"].lower())
