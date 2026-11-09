from django.urls import path
from .views import (
    CreateUploadSessionView,
    UploadChunkView,
    CompleteUploadView,
    DirectMultipartUploadView,
    StreamDownloadView,
    StreamThumbnailView,
    UserStorageQuotaView,
)

urlpatterns = [
    # Chunked Resumable Upload
    path("upload/session", CreateUploadSessionView.as_view(), name="storage-session"),
    path("upload/session/", CreateUploadSessionView.as_view(), name="storage-session-slash"),
    path("upload/chunk", UploadChunkView.as_view(), name="storage-chunk"),
    path("upload/chunk/", UploadChunkView.as_view(), name="storage-chunk-slash"),
    path("upload/complete", CompleteUploadView.as_view(), name="storage-complete"),
    path("upload/complete/", CompleteUploadView.as_view(), name="storage-complete-slash"),

    # Direct Single Multipart Upload
    path("upload", DirectMultipartUploadView.as_view(), name="storage-direct-upload"),
    path("upload/", DirectMultipartUploadView.as_view(), name="storage-direct-upload-slash"),

    # Authenticated Streaming File Download & Thumbnails
    path("file/<str:session_id>", StreamDownloadView.as_view(), name="storage-download"),
    path("file/<str:session_id>/", StreamDownloadView.as_view(), name="storage-download-slash"),
    path("file/<str:session_id>/thumb", StreamThumbnailView.as_view(), name="storage-thumbnail"),
    path("file/<str:session_id>/thumb/", StreamThumbnailView.as_view(), name="storage-thumbnail-slash"),

    # Quota
    path("quota", UserStorageQuotaView.as_view(), name="storage-quota"),
    path("quota/", UserStorageQuotaView.as_view(), name="storage-quota-slash"),
]

