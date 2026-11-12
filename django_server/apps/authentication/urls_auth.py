from django.urls import path
from .views import (
    PasswordLoginView,
    RegisterRequestView,
    RegisterVerifyView,
    AuthConfigView,
    RequestOTPView,
    VerifyOTPView,
    AccountRecoveryView,
    GoogleAuthView,
    GitHubAuthView,
    FacebookAuthView,
    LinkedProvidersView,
    UnlinkProviderView,
    RefreshTokenView,
    LogoutView,
    UserSessionsView,
    RevokeSessionView,
    RevokeOtherSessionsView,
    ResolveDeviceLimitView,
    RegisterDeviceView,
    MFAStatusView,
    MFASetupView,
    MFAVerifySetupView,
    MFADisableView,
    MFARegenerateBackupCodesView,
    MFALoginVerifyView,
    QRCreateView,
    QRStatusView,
    QRApproveView,
    QRClaimView,
)

urlpatterns = [
    # Public Auth Configuration (OAuth client IDs)
    path("config", AuthConfigView.as_view(), name="auth-config"),
    path("config/", AuthConfigView.as_view(), name="auth-config-slash"),

    # Username / Email + Password Login
    path("login", PasswordLoginView.as_view(), name="auth-login"),
    path("login/", PasswordLoginView.as_view(), name="auth-login-slash"),

    # Registration with Email OTP Verification
    path("register", RegisterRequestView.as_view(), name="auth-register"),
    path("register/", RegisterRequestView.as_view(), name="auth-register-slash"),
    path("register/request", RegisterRequestView.as_view(), name="auth-register-request"),
    path("register/request/", RegisterRequestView.as_view(), name="auth-register-request-slash"),
    path("register/verify", RegisterVerifyView.as_view(), name="auth-register-verify"),
    path("register/verify/", RegisterVerifyView.as_view(), name="auth-register-verify-slash"),

    # Passwordless Email OTP Login / Verification
    path("request-otp", RequestOTPView.as_view(), name="auth-request-otp"),
    path("request-otp/", RequestOTPView.as_view(), name="auth-request-otp-slash"),
    path("verify-otp", VerifyOTPView.as_view(), name="auth-verify-otp"),
    path("verify-otp/", VerifyOTPView.as_view(), name="auth-verify-otp-slash"),
    path("otp/request", RequestOTPView.as_view(), name="auth-otp-request"),
    path("otp/request/", RequestOTPView.as_view(), name="auth-otp-request-slash"),
    path("otp/verify", VerifyOTPView.as_view(), name="auth-otp-verify"),
    path("otp/verify/", VerifyOTPView.as_view(), name="auth-otp-verify-slash"),

    # Account Recovery
    path("recovery", AccountRecoveryView.as_view(), name="auth-recovery"),
    path("recovery/", AccountRecoveryView.as_view(), name="auth-recovery-slash"),

    # Social OAuth
    path("oauth/google", GoogleAuthView.as_view(), name="auth-google"),
    path("oauth/google/", GoogleAuthView.as_view(), name="auth-google-slash"),
    path("oauth/github", GitHubAuthView.as_view(), name="auth-github"),
    path("oauth/github/", GitHubAuthView.as_view(), name="auth-github-slash"),
    path("oauth/facebook", FacebookAuthView.as_view(), name="auth-facebook"),
    path("oauth/facebook/", FacebookAuthView.as_view(), name="auth-facebook-slash"),
    path("oauth/providers", LinkedProvidersView.as_view(), name="auth-providers"),
    path("oauth/providers/", LinkedProvidersView.as_view(), name="auth-providers-slash"),
    path("oauth/unlink", UnlinkProviderView.as_view(), name="auth-unlink"),
    path("oauth/unlink/", UnlinkProviderView.as_view(), name="auth-unlink-slash"),

    # Token and Session Management
    path("refresh", RefreshTokenView.as_view(), name="auth-refresh"),
    path("refresh/", RefreshTokenView.as_view(), name="auth-refresh-slash"),
    path("logout", LogoutView.as_view(), name="auth-logout"),
    path("logout/", LogoutView.as_view(), name="auth-logout-slash"),
    path("sessions", UserSessionsView.as_view(), name="auth-sessions"),
    path("sessions/", UserSessionsView.as_view(), name="auth-sessions-slash"),
    path("sessions/revoke-others", RevokeOtherSessionsView.as_view(), name="auth-revoke-other-sessions"),
    path("sessions/revoke-others/", RevokeOtherSessionsView.as_view(), name="auth-revoke-other-sessions-slash"),
    path("sessions/resolve-limit", ResolveDeviceLimitView.as_view(), name="auth-resolve-device-limit"),
    path("sessions/resolve-limit/", ResolveDeviceLimitView.as_view(), name="auth-resolve-device-limit-slash"),
    path("sessions/<str:session_id>", RevokeSessionView.as_view(), name="auth-revoke-session"),
    path("sessions/<str:session_id>/", RevokeSessionView.as_view(), name="auth-revoke-session-slash"),
    path("devices/register", RegisterDeviceView.as_view(), name="auth-register-device"),
    path("devices/register/", RegisterDeviceView.as_view(), name="auth-register-device-slash"),

    # Multi-Factor Authentication (TOTP + Backup Recovery Codes)
    path("mfa/status", MFAStatusView.as_view(), name="auth-mfa-status"),
    path("mfa/status/", MFAStatusView.as_view(), name="auth-mfa-status-slash"),
    path("mfa/setup", MFASetupView.as_view(), name="auth-mfa-setup"),
    path("mfa/setup/", MFASetupView.as_view(), name="auth-mfa-setup-slash"),
    path("mfa/verify-setup", MFAVerifySetupView.as_view(), name="auth-mfa-verify-setup"),
    path("mfa/verify-setup/", MFAVerifySetupView.as_view(), name="auth-mfa-verify-setup-slash"),
    path("mfa/disable", MFADisableView.as_view(), name="auth-mfa-disable"),
    path("mfa/disable/", MFADisableView.as_view(), name="auth-mfa-disable-slash"),
    path("mfa/backup-codes", MFARegenerateBackupCodesView.as_view(), name="auth-mfa-backup-codes"),
    path("mfa/backup-codes/", MFARegenerateBackupCodesView.as_view(), name="auth-mfa-backup-codes-slash"),
    path("mfa/login-verify", MFALoginVerifyView.as_view(), name="auth-mfa-login-verify"),
    path("mfa/login-verify/", MFALoginVerifyView.as_view(), name="auth-mfa-login-verify-slash"),

    # QR Code Companion Login
    path("qr/create", QRCreateView.as_view(), name="auth-qr-create"),
    path("qr/create/", QRCreateView.as_view(), name="auth-qr-create-slash"),
    path("qr/status", QRStatusView.as_view(), name="auth-qr-status"),
    path("qr/status/", QRStatusView.as_view(), name="auth-qr-status-slash"),
    path("qr/approve", QRApproveView.as_view(), name="auth-qr-approve"),
    path("qr/approve/", QRApproveView.as_view(), name="auth-qr-approve-slash"),
    path("qr/claim", QRClaimView.as_view(), name="auth-qr-claim"),
    path("qr/claim/", QRClaimView.as_view(), name="auth-qr-claim-slash"),
]
