from django.contrib import admin
from django.contrib import messages as django_messages

from apps.authentication.models import (
    AuditLog,
    BlockedUser,
    Contact,
    Device,
    EmailOTP,
    QRLoginSession,
    RefreshToken,
    Report,
    Request,
    SocialAccount,
    User,
    UserMFA,
    UserProfile,
    UserSession,
)
from apps.authentication.services.session_service import SessionService

admin.site.site_header = "ChitChat Superadmin Console"
admin.site.site_title = "ChitChat Admin"
admin.site.index_title = "Platform Analytics, Security & Operations"
admin.site.site_url = "/admin-panel"


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("email", "username", "name", "role", "is_staff", "is_superuser", "is_active", "status", "created_at")
    list_filter = ("role", "is_staff", "is_superuser", "is_active", "status")
    search_fields = ("email", "username", "name")
    ordering = ("-created_at",)
    list_per_page = 50
    show_full_result_count = False
    actions = ["promote_to_superadmin", "suspend_and_revoke_sessions", "activate_users"]

    @admin.action(description="Promote selected users to Superadmin (admin)")
    def promote_to_superadmin(self, request, queryset):
        updated = queryset.update(role="admin", is_staff=True, is_superuser=True, is_active=True)
        self.message_user(request, f"Promoted {updated} user(s) to Superadmin.", level=django_messages.SUCCESS)

    @admin.action(description="Suspend selected users & revoke active sessions")
    def suspend_and_revoke_sessions(self, request, queryset):
        count = 0
        for u in queryset:
            u.is_active = False
            u.save(update_fields=["is_active"])
            SessionService.mark_user_sessions_revoked(u)
            count += 1
        self.message_user(request, f"Suspended {count} user(s) and revoked active tokens.", level=django_messages.WARNING)

    @admin.action(description="Activate selected users")
    def activate_users(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(request, f"Activated {updated} user(s).", level=django_messages.SUCCESS)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "display_name", "online_status", "hide_from_search", "last_seen")
    list_filter = ("online_status", "hide_from_search")
    search_fields = ("user__email", "user__username", "display_name")
    raw_id_fields = ("user",)
    list_per_page = 50
    show_full_result_count = False


@admin.register(UserMFA)
class UserMFAAdmin(admin.ModelAdmin):
    list_display = ("user", "is_enabled", "enabled_at", "last_used_at")
    list_filter = ("is_enabled",)
    search_fields = ("user__email", "user__username")
    raw_id_fields = ("user",)
    readonly_fields = ("totp_secret", "pending_secret", "backup_code_hashes", "enabled_at", "last_used_at")
    list_per_page = 50


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ("user", "device_name", "platform", "device_id", "is_active", "last_active_at")
    list_filter = ("platform", "is_active")
    search_fields = ("user__email", "user__username", "device_id", "device_name")
    raw_id_fields = ("user",)
    list_per_page = 50


@admin.register(UserSession)
class UserSessionAdmin(admin.ModelAdmin):
    list_display = ("user", "device", "auth_method", "ip_address", "is_revoked", "created_at", "expires_at")
    list_filter = ("is_revoked", "auth_method")
    search_fields = ("user__email", "user__username", "ip_address", "session_token")
    raw_id_fields = ("user", "device", "linked_by_session")
    list_per_page = 50
    actions = ["revoke_selected_sessions"]

    @admin.action(description="Revoke selected sessions immediately (JWT + DB)")
    def revoke_selected_sessions(self, request, queryset):
        revoked = 0
        for s in queryset:
            if SessionService.revoke_session(s.user, str(s.id)):
                revoked += 1
        self.message_user(request, f"Revoked {revoked} active session(s).", level=django_messages.WARNING)


@admin.register(QRLoginSession)
class QRLoginSessionAdmin(admin.ModelAdmin):
    list_display = ("qr_token", "status", "user", "target_device_name", "target_platform", "created_at", "expires_at")
    list_filter = ("status", "target_platform")
    search_fields = ("qr_token", "user__email", "target_device_name")
    raw_id_fields = ("user", "approved_by_session")
    list_per_page = 50


@admin.register(RefreshToken)
class RefreshTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "jti", "is_revoked", "created_at", "expires_at")
    list_filter = ("is_revoked",)
    search_fields = ("user__email", "jti")
    raw_id_fields = ("user", "session")
    list_per_page = 50


@admin.register(SocialAccount)
class SocialAccountAdmin(admin.ModelAdmin):
    list_display = ("user", "provider", "email", "uid", "created_at")
    list_filter = ("provider",)
    search_fields = ("user__email", "email", "uid")
    raw_id_fields = ("user",)
    list_per_page = 50


@admin.register(EmailOTP)
class EmailOTPAdmin(admin.ModelAdmin):
    list_display = ("email", "purpose", "attempts", "is_used", "expires_at", "created_at")
    list_filter = ("purpose", "is_used")
    search_fields = ("email",)
    list_per_page = 50


@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = ("user", "contact_user", "alias", "created_at")
    search_fields = ("user__email", "contact_user__email")
    raw_id_fields = ("user", "contact_user")
    list_per_page = 50


@admin.register(BlockedUser)
class BlockedUserAdmin(admin.ModelAdmin):
    list_display = ("user", "blocked_user", "reason", "created_at")
    search_fields = ("user__email", "blocked_user__email")
    raw_id_fields = ("user", "blocked_user")
    list_per_page = 50


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ("reporter", "reported_user", "status", "reason", "created_at")
    list_filter = ("status",)
    search_fields = ("reporter__email", "reported_user__email", "reason")
    raw_id_fields = ("reporter", "reported_user")
    list_per_page = 50


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("action", "user", "ip_address", "created_at")
    list_filter = ("action",)
    search_fields = ("action", "user__email", "ip_address")
    raw_id_fields = ("user",)
    readonly_fields = ("user", "action", "ip_address", "user_agent", "details", "created_at")
    list_per_page = 50
    show_full_result_count = False


@admin.register(Request)
class FriendRequestAdmin(admin.ModelAdmin):
    list_display = ("sender", "receiver", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("sender__email", "receiver__email")
    raw_id_fields = ("sender", "receiver")
    list_per_page = 50

