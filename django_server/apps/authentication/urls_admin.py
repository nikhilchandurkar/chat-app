from django.urls import path
from .views import (
    AdminVerifyView,
    AdminLogoutView,
    AdminUsersView,
    AdminChatsView,
    AdminMessagesView,
    AdminStatsView,
)

urlpatterns = [
    path('verify', AdminVerifyView.as_view(), name='admin-verify'),
    path('logout', AdminLogoutView.as_view(), name='admin-logout'),
    path('users', AdminUsersView.as_view(), name='admin-users'),
    path('chats', AdminChatsView.as_view(), name='admin-chats'),
    path('messages', AdminMessagesView.as_view(), name='admin-messages'),
    path('stats', AdminStatsView.as_view(), name='admin-stats'),
]

