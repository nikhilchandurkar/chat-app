from django.contrib import admin

from apps.status_app.models import StatusReaction, StatusView, UserStatus


@admin.register(UserStatus)
class UserStatusAdmin(admin.ModelAdmin):
    list_display = ("id", "status_type", "privacy", "expires_at", "created_at")
    list_filter = ("status_type", "privacy")
    raw_id_fields = ("allowed_users", "excluded_users")
    list_per_page = 50


@admin.register(StatusView)
class StatusViewAdmin(admin.ModelAdmin):
    list_display = ("id", "viewed_at")
    list_per_page = 50


@admin.register(StatusReaction)
class StatusReactionAdmin(admin.ModelAdmin):
    list_display = ("id", "reaction", "created_at")
    list_per_page = 50

