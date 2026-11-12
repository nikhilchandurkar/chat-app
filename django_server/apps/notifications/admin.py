from django.contrib import admin

from apps.notifications.models import (
    Notification,
    NotificationDelivery,
    NotificationPreference,
    WebPushSubscription,
)


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("title", "notification_type", "is_read", "created_at")
    list_filter = ("notification_type", "is_read")
    search_fields = ("title", "body")
    list_per_page = 50


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = ("user", "direct_messages", "group_messages", "web_push_enabled", "fcm_enabled", "updated_at")
    raw_id_fields = ("user",)
    list_per_page = 50


@admin.register(NotificationDelivery)
class NotificationDeliveryAdmin(admin.ModelAdmin):
    list_display = ("id", "status", "sent_at", "created_at")
    list_filter = ("status",)
    list_per_page = 50


@admin.register(WebPushSubscription)
class WebPushSubscriptionAdmin(admin.ModelAdmin):
    list_display = ("id", "created_at")
    list_per_page = 50

