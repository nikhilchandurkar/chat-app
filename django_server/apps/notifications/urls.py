from django.urls import path
from .views import (
    VapidPublicKeyView,
    WebPushSubscribeView,
    NotificationPreferencesView,
    NotificationListView,
    MarkAllNotificationsReadView,
)

urlpatterns = [
    path("webpush/vapid-key", VapidPublicKeyView.as_view(), name="vapid-key"),
    path("webpush/vapid-key/", VapidPublicKeyView.as_view(), name="vapid-key-slash"),
    path("webpush/subscribe", WebPushSubscribeView.as_view(), name="webpush-subscribe"),
    path("webpush/subscribe/", WebPushSubscribeView.as_view(), name="webpush-subscribe-slash"),
    path("preferences", NotificationPreferencesView.as_view(), name="notification-preferences"),
    path("preferences/", NotificationPreferencesView.as_view(), name="notification-preferences-slash"),
    path("list", NotificationListView.as_view(), name="notification-list"),
    path("list/", NotificationListView.as_view(), name="notification-list-slash"),
    path("read-all", MarkAllNotificationsReadView.as_view(), name="notification-read-all"),
    path("read-all/", MarkAllNotificationsReadView.as_view(), name="notification-read-all-slash"),
]

