from django.urls import path
from .views import (
    NewGroupChatView,
    MyChatsView,
    MyGroupsView,
    ChatDetailsView,
    AddMembersView,
    RemoveMemberView,
    LeaveGroupView,
    ToggleRestrictedMessagesView,
    AddAdminView,
    RemoveAdminView,
    GetPinnedMessagesView,
    PinMessageView,
    UnpinMessageView,
    SendAttachmentsView,
    GetChatMessagesView,
)

urlpatterns = [
    path('new', NewGroupChatView.as_view(), name='chat-new'),
    path('my', MyChatsView.as_view(), name='chat-my'),
    path('my/groups', MyGroupsView.as_view(), name='chat-my-groups'),
    path('addmembers', AddMembersView.as_view(), name='chat-add-members'),
    path('removemember', RemoveMemberView.as_view(), name='chat-remove-member'),
    path('leave/<str:id>', LeaveGroupView.as_view(), name='chat-leave'),
    path('add-admin', AddAdminView.as_view(), name='chat-add-admin'),
    path('remove-admin', RemoveAdminView.as_view(), name='chat-remove-admin'),
    path('message', SendAttachmentsView.as_view(), name='chat-send-attachments'),
    path('message/<str:id>', GetChatMessagesView.as_view(), name='chat-get-messages'),
    path('<str:chat_id>/pins', GetPinnedMessagesView.as_view(), name='chat-get-pins'),
    path('<str:chat_id>/pin/<str:message_id>', PinMessageView.as_view(), name='chat-pin-message'),
    path('<str:id>/restrict', ToggleRestrictedMessagesView.as_view(), name='chat-toggle-restrict'),
    path('<str:id>', ChatDetailsView.as_view(), name='chat-details'),
]

