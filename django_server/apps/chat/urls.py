from django.urls import path
from apps.messages_app.views import GetMessagesView, SendMessageView
from .views import (
    NewGroupChatView,
    CreateDirectChatView,
    MyChatsView,
    MyGroupsView,
    ChatDetailsView,
    AddMembersView,
    RemoveMembersView,
    LeaveGroupView,
    TogglePinConversationView,
    ToggleMuteConversationView,
    ToggleArchiveConversationView,
    UpdateEphemeralTTLView,
    GenerateInvitationLinkView,
    InspectInvitationLinkView,
    AcceptInvitationLinkView,
    RevokeInvitationLinkView,
)

urlpatterns = [
    path("new", NewGroupChatView.as_view(), name="chat-new-group"),
    path("new/", NewGroupChatView.as_view(), name="chat-new-group-slash"),
    path("direct", CreateDirectChatView.as_view(), name="chat-new-direct"),
    path("direct/", CreateDirectChatView.as_view(), name="chat-new-direct-slash"),
    path("my", MyChatsView.as_view(), name="chat-my"),
    path("my/", MyChatsView.as_view(), name="chat-my-slash"),
    path("my/groups", MyGroupsView.as_view(), name="chat-my-groups"),
    path("my/groups/", MyGroupsView.as_view(), name="chat-my-groups-slash"),
    path("addmembers", AddMembersView.as_view(), name="chat-add-members"),
    path("addmembers/", AddMembersView.as_view(), name="chat-add-members-slash"),
    path("removemember", RemoveMembersView.as_view(), name="chat-remove-member"),
    path("removemember/", RemoveMembersView.as_view(), name="chat-remove-member-slash"),
    path("leave/<str:id>", LeaveGroupView.as_view(), name="chat-leave"),
    path("leave/<str:id>/", LeaveGroupView.as_view(), name="chat-leave-slash"),
    path("pin/<str:id>", TogglePinConversationView.as_view(), name="chat-pin"),
    path("pin/<str:id>/", TogglePinConversationView.as_view(), name="chat-pin-slash"),
    path("mute/<str:id>", ToggleMuteConversationView.as_view(), name="chat-mute"),
    path("mute/<str:id>/", ToggleMuteConversationView.as_view(), name="chat-mute-slash"),
    path("archive/<str:id>", ToggleArchiveConversationView.as_view(), name="chat-archive"),
    path("archive/<str:id>/", ToggleArchiveConversationView.as_view(), name="chat-archive-slash"),

    # Ephemeral / Disappearing Messages
    path("<str:id>/ephemeral", UpdateEphemeralTTLView.as_view(), name="chat-ephemeral"),
    path("<str:id>/ephemeral/", UpdateEphemeralTTLView.as_view(), name="chat-ephemeral-slash"),

    # Private Invitation Links
    path("<str:id>/invite", GenerateInvitationLinkView.as_view(), name="chat-invite-generate"),
    path("<str:id>/invite/", GenerateInvitationLinkView.as_view(), name="chat-invite-generate-slash"),
    path("invite/<str:token>", InspectInvitationLinkView.as_view(), name="chat-invite-inspect"),
    path("invite/<str:token>/", InspectInvitationLinkView.as_view(), name="chat-invite-inspect-slash"),
    path("invite/<str:token>/accept", AcceptInvitationLinkView.as_view(), name="chat-invite-accept"),
    path("invite/<str:token>/accept/", AcceptInvitationLinkView.as_view(), name="chat-invite-accept-slash"),
    path("invite/revoke/<str:id>", RevokeInvitationLinkView.as_view(), name="chat-invite-revoke"),
    path("invite/revoke/<str:id>/", RevokeInvitationLinkView.as_view(), name="chat-invite-revoke-slash"),

    # Messages
    path("message/<str:id>", GetMessagesView.as_view(), name="chat-get-messages"),
    path("message/<str:id>/", GetMessagesView.as_view(), name="chat-get-messages-slash"),
    path("message", SendMessageView.as_view(), name="chat-send-message"),
    path("message/", SendMessageView.as_view(), name="chat-send-message-slash"),
    path("<str:id>", ChatDetailsView.as_view(), name="chat-details"),
    path("<str:id>/", ChatDetailsView.as_view(), name="chat-details-slash"),
]
