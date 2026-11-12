from django.contrib import admin

from apps.chat.models import (
    Conversation,
    ConversationMember,
    Group,
    GroupMember,
    InvitationLink,
    PinnedMessage,
)


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "type", "group_chat", "creator", "is_archived", "created_at")
    list_filter = ("type", "group_chat", "is_archived")
    search_fields = ("id", "name", "creator__email")
    raw_id_fields = ("creator", "members", "admins")
    list_per_page = 50
    show_full_result_count = False


@admin.register(ConversationMember)
class ConversationMemberAdmin(admin.ModelAdmin):
    list_display = ("conversation", "user", "role", "unread_count", "is_muted", "is_pinned", "joined_at")
    list_filter = ("role", "is_muted", "is_pinned", "is_archived")
    search_fields = ("user__email", "user__username")
    raw_id_fields = ("conversation", "user")
    list_per_page = 50
    show_full_result_count = False


@admin.register(Group)
class GroupAdmin(admin.ModelAdmin):
    list_display = ("name", "conversation", "restrict_messages", "created_at")
    list_filter = ("restrict_messages",)
    search_fields = ("name",)
    raw_id_fields = ("conversation",)
    list_per_page = 50


@admin.register(GroupMember)
class GroupMemberAdmin(admin.ModelAdmin):
    list_display = ("group", "user", "role", "created_at")
    list_filter = ("role",)
    raw_id_fields = ("group", "user")
    list_per_page = 50


@admin.register(PinnedMessage)
class PinnedMessageAdmin(admin.ModelAdmin):
    list_display = ("conversation", "message", "pinned_by", "pinned_at")
    raw_id_fields = ("conversation", "message", "pinned_by")
    list_per_page = 50


@admin.register(InvitationLink)
class InvitationLinkAdmin(admin.ModelAdmin):
    list_display = ("id", "invitation_type", "conversation", "created_by", "uses_count", "max_uses", "is_revoked", "expires_at")
    list_filter = ("invitation_type", "is_revoked")
    raw_id_fields = ("conversation", "created_by")
    list_per_page = 50

