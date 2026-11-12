from django.contrib import admin

from apps.messages_app.models import (
    DeletedMessageForUser,
    Message,
    MessageAttachment,
    MessageEdit,
    MessageReaction,
    MessageReceipt,
    ScheduledMessage,
    StarredMessage,
)


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "conversation", "sender", "message_type", "status", "is_edited", "is_deleted", "created_at")
    list_filter = ("message_type", "status", "is_edited", "is_deleted")
    search_fields = ("id", "sender__email", "client_message_id")
    raw_id_fields = ("conversation", "sender")
    list_per_page = 50
    show_full_result_count = False


@admin.register(MessageAttachment)
class MessageAttachmentAdmin(admin.ModelAdmin):
    list_display = ("file_name", "file_type", "file_size", "mime_type", "message", "created_at")
    list_filter = ("file_type",)
    search_fields = ("file_name", "mime_type")
    raw_id_fields = ("message",)
    list_per_page = 50


@admin.register(MessageReceipt)
class MessageReceiptAdmin(admin.ModelAdmin):
    list_display = ("message", "user", "status", "timestamp")
    list_filter = ("status",)
    raw_id_fields = ("message", "user")
    list_per_page = 50


@admin.register(MessageReaction)
class MessageReactionAdmin(admin.ModelAdmin):
    list_display = ("message", "user", "reaction", "created_at")
    raw_id_fields = ("message", "user")
    list_per_page = 50


@admin.register(MessageEdit)
class MessageEditAdmin(admin.ModelAdmin):
    list_display = ("message", "edited_at")
    raw_id_fields = ("message",)
    list_per_page = 50


@admin.register(StarredMessage)
class StarredMessageAdmin(admin.ModelAdmin):
    list_display = ("user", "message", "created_at")
    raw_id_fields = ("user", "message")
    list_per_page = 50


@admin.register(ScheduledMessage)
class ScheduledMessageAdmin(admin.ModelAdmin):
    list_display = ("message", "scheduled_at", "is_processed", "created_at")
    list_filter = ("is_processed",)
    raw_id_fields = ("message",)
    list_per_page = 50


@admin.register(DeletedMessageForUser)
class DeletedMessageForUserAdmin(admin.ModelAdmin):
    list_display = ("message", "user", "deleted_at")
    raw_id_fields = ("message", "user")
    list_per_page = 50

