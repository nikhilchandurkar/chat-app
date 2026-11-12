from django.contrib import admin

from apps.outbox.models import MessageOutbox


@admin.register(MessageOutbox)
class MessageOutboxAdmin(admin.ModelAdmin):
    list_display = ("event_id", "event_type", "stream_name", "status", "retry_count", "created_at", "processed_at")
    list_filter = ("status", "event_type", "stream_name")
    search_fields = ("event_id", "conversation_id")
    list_per_page = 50
    show_full_result_count = False

