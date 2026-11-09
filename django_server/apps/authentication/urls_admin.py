from django.urls import path
from .views_admin import (
    AdminVerifyView,
    AdminLogoutView,
    AdminStatsView,
    AdminUsersView,
    AdminUserSuspendView,
    AdminChatsView,
    AdminMessagesView,
    AdminReportsView,
    AdminAuditLogsView,
)

urlpatterns = [
    path("verify", AdminVerifyView.as_view(), name="admin-verify"),
    path("verify/", AdminVerifyView.as_view(), name="admin-verify-slash"),
    path("logout", AdminLogoutView.as_view(), name="admin-logout"),
    path("logout/", AdminLogoutView.as_view(), name="admin-logout-slash"),
    path("stats", AdminStatsView.as_view(), name="admin-stats"),
    path("stats/", AdminStatsView.as_view(), name="admin-stats-slash"),
    path("users", AdminUsersView.as_view(), name="admin-users"),
    path("users/", AdminUsersView.as_view(), name="admin-users-slash"),
    path("users/<str:user_id>/suspend", AdminUserSuspendView.as_view(), name="admin-user-suspend"),
    path("users/<str:user_id>/suspend/", AdminUserSuspendView.as_view(), name="admin-user-suspend-slash"),
    path("chats", AdminChatsView.as_view(), name="admin-chats"),
    path("chats/", AdminChatsView.as_view(), name="admin-chats-slash"),
    path("messages", AdminMessagesView.as_view(), name="admin-messages"),
    path("messages/", AdminMessagesView.as_view(), name="admin-messages-slash"),
    path("reports", AdminReportsView.as_view(), name="admin-reports"),
    path("reports/", AdminReportsView.as_view(), name="admin-reports-slash"),
    path("audit-logs", AdminAuditLogsView.as_view(), name="admin-audit-logs"),
    path("audit-logs/", AdminAuditLogsView.as_view(), name="admin-audit-logs-slash"),
]
