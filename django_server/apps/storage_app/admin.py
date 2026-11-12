from django.contrib import admin

from apps.storage_app.models import UploadChunk, UploadSession, UserStorageUsage


@admin.register(UploadSession)
class UploadSessionAdmin(admin.ModelAdmin):
    list_display = ("file_name", "file_type", "total_size", "total_chunks", "is_completed", "created_at")
    list_filter = ("file_type", "is_completed")
    search_fields = ("file_name", "checksum_sha256")
    list_per_page = 50


@admin.register(UploadChunk)
class UploadChunkAdmin(admin.ModelAdmin):
    list_display = ("session", "chunk_index", "chunk_size", "is_verified", "created_at")
    list_filter = ("is_verified",)
    raw_id_fields = ("session",)
    list_per_page = 50


@admin.register(UserStorageUsage)
class UserStorageUsageAdmin(admin.ModelAdmin):
    list_display = ("user", "bytes_used", "quota_bytes", "updated_at")
    search_fields = ("user__email", "user__username")
    raw_id_fields = ("user",)
    list_per_page = 50

