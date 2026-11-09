from django.urls import path
from .views import (
    PasswordLoginView,
    RegisterRequestView,
    RegisterVerifyView,
    GetMyProfileView,
    UpdateProfileView,
    DeleteProfileView,
    UpdateStatusView,
    UpdatePrivacyView,
    LogoutView,
    SearchUserView,
    SendFriendRequestView,
    AcceptFriendRequestView,
    GetNotificationsView,
    GetMyFriendsView,
    ToggleStarMessageView,
    GetStarredMessagesView,
    BlockUserView,
    GetBlockedUsersView,
    ReportUserView,
    ExportUserDataView,
    DeleteAccountView,
)

urlpatterns = [
    # Auth Aliases for /api/v1/user/
    path("login", PasswordLoginView.as_view(), name="user-login"),
    path("login/", PasswordLoginView.as_view(), name="user-login-slash"),
    path("register", RegisterRequestView.as_view(), name="user-register"),
    path("register/", RegisterRequestView.as_view(), name="user-register-slash"),
    path("register/verify", RegisterVerifyView.as_view(), name="user-register-verify"),
    path("register/verify/", RegisterVerifyView.as_view(), name="user-register-verify-slash"),

    # User Profile
    path("me", GetMyProfileView.as_view(), name="user-me"),
    path("me/", GetMyProfileView.as_view(), name="user-me-slash"),
    path("profile", UpdateProfileView.as_view(), name="user-profile"),
    path("profile/", UpdateProfileView.as_view(), name="user-profile-slash"),
    path("profile/delete", DeleteProfileView.as_view(), name="user-profile-delete"),
    path("profile/delete/", DeleteProfileView.as_view(), name="user-profile-delete-slash"),
    path("status", UpdateStatusView.as_view(), name="user-status"),
    path("status/", UpdateStatusView.as_view(), name="user-status-slash"),
    path("privacy", UpdatePrivacyView.as_view(), name="user-privacy"),
    path("privacy/", UpdatePrivacyView.as_view(), name="user-privacy-slash"),
    path("logout", LogoutView.as_view(), name="user-logout"),
    path("logout/", LogoutView.as_view(), name="user-logout-slash"),
    path("search", SearchUserView.as_view(), name="user-search"),
    path("search/", SearchUserView.as_view(), name="user-search-slash"),

    # GDPR Privacy & Account Erasure
    path("export-data", ExportUserDataView.as_view(), name="user-export-data"),
    path("export-data/", ExportUserDataView.as_view(), name="user-export-data-slash"),
    path("delete-account", DeleteAccountView.as_view(), name="user-delete-account"),
    path("delete-account/", DeleteAccountView.as_view(), name="user-delete-account-slash"),

    # Social & Requests
    path("sendrequest", SendFriendRequestView.as_view(), name="user-send-request"),
    path("sendrequest/", SendFriendRequestView.as_view(), name="user-send-request-slash"),
    path("acceptrequest", AcceptFriendRequestView.as_view(), name="user-accept-request"),
    path("acceptrequest/", AcceptFriendRequestView.as_view(), name="user-accept-request-slash"),
    path("notifications", GetNotificationsView.as_view(), name="user-notifications"),
    path("notifications/", GetNotificationsView.as_view(), name="user-notifications-slash"),
    path("friends", GetMyFriendsView.as_view(), name="user-friends"),
    path("friends/", GetMyFriendsView.as_view(), name="user-friends-slash"),

    # Starred Messages
    path("star/<str:id>", ToggleStarMessageView.as_view(), name="user-star-toggle"),
    path("star/<str:id>/", ToggleStarMessageView.as_view(), name="user-star-toggle-slash"),
    path("starred", GetStarredMessagesView.as_view(), name="user-starred"),
    path("starred/", GetStarredMessagesView.as_view(), name="user-starred-slash"),

    # Blocks & Reports
    path("block/<str:user_id>", BlockUserView.as_view(), name="user-block"),
    path("block/<str:user_id>/", BlockUserView.as_view(), name="user-block-slash"),
    path("blocked", GetBlockedUsersView.as_view(), name="user-blocked"),
    path("blocked/", GetBlockedUsersView.as_view(), name="user-blocked-slash"),
    path("report", ReportUserView.as_view(), name="user-report"),
    path("report/", ReportUserView.as_view(), name="user-report-slash"),
]
