"""Tests for concurrent device/session limits, QR companion login, TOTP MFA, and superadmin promotion."""

from io import StringIO

from django.core.cache import cache
from django.core.management import call_command
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.authentication.models import User, UserSession
from apps.authentication.services.mfa_service import compute_totp_code, MFAService


@override_settings(MAX_ACTIVE_SESSIONS_PER_USER=3)
class AuthSecurityFeaturesTestCase(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            email="sec_tester@example.com",
            username="sec_tester",
            password="StrongPassword123!",
            name="Security Tester",
        )

    def _login(self, device_id: str, platform: str = "web", replace_session_id: str = ""):
        payload = {
            "username": self.user.username,
            "password": "StrongPassword123!",
            "device_id": device_id,
            "device_name": f"Device {device_id}",
            "platform": platform,
        }
        if replace_session_id:
            payload["replace_session_id"] = replace_session_id
        return self.client.post("/api/v1/auth/login", payload, format="json")

    def test_device_limit_enforcement_and_replacement(self):
        r1 = self._login("phone-1", "android")
        r2 = self._login("web-2", "web")
        r3 = self._login("web-3", "web")
        self.assertEqual(r1.status_code, status.HTTP_200_OK)
        self.assertEqual(r2.status_code, status.HTTP_200_OK)
        self.assertEqual(r3.status_code, status.HTTP_200_OK)

        # Re-logging in with an existing device_id replaces only its own slot
        r2_relogin = self._login("web-2", "web")
        self.assertEqual(r2_relogin.status_code, status.HTTP_200_OK)
        self.assertEqual(UserSession.objects.filter(user=self.user, is_revoked=False).count(), 3)

        # 4th distinct device is blocked with 409 DEVICE_LIMIT_REACHED
        r4 = self._login("tablet-4", "ios")
        self.assertEqual(r4.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(r4.data["code"], "DEVICE_LIMIT_REACHED")
        self.assertEqual(r4.data["max_devices"], 3)
        self.assertEqual(len(r4.data["active_sessions"]), 3)
        limit_token = r4.data["deviceLimitToken"]
        self.assertTrue(limit_token)

        # Pick first session to replace via resolve-limit
        victim_sid = r1.data["session_id"]
        res_swap = self.client.post(
            "/api/v1/auth/sessions/resolve-limit",
            {"device_limit_token": limit_token, "replace_session_id": victim_sid},
            format="json",
        )
        self.assertEqual(res_swap.status_code, status.HTTP_200_OK)
        self.assertTrue(UserSession.objects.get(id=victim_sid).is_revoked)

        # Revoked session's access token is immediately rejected on /api/v1/user/me
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r1.data['token']}")
        me_revoked = self.client.get("/api/v1/user/me")
        self.assertEqual(me_revoked.status_code, status.HTTP_401_UNAUTHORIZED)

        # New session token works normally
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res_swap.data['token']}")
        me_new = self.client.get("/api/v1/user/me")
        self.assertEqual(me_new.status_code, status.HTTP_200_OK)

    def test_qr_companion_login_flow(self):
        # 1. Phone logs in first
        r_phone = self._login("android-primary", "android")
        self.assertEqual(r_phone.status_code, status.HTTP_200_OK)
        phone_token = r_phone.data["token"]

        # 2. Unauthenticated browser generates QR code
        qr_res = self.client.post(
            "/api/v1/auth/qr/create",
            {"device_id": "web-companion-1", "device_name": "Chrome Laptop", "platform": "web"},
            format="json",
        )
        self.assertEqual(qr_res.status_code, status.HTTP_200_OK)
        qr_token = qr_res.data["qr_token"]
        claim_secret = qr_res.data["claim_secret"]
        self.assertIn(qr_token, qr_res.data["qr_payload"])

        # 3. Wrong claim_secret is rejected
        bad_poll = self.client.get(f"/api/v1/auth/qr/status?token={qr_token}&claim_secret=wrong")
        self.assertEqual(bad_poll.status_code, status.HTTP_400_BAD_REQUEST)

        # 4. Pending status check
        poll_pending = self.client.get(f"/api/v1/auth/qr/status?token={qr_token}&claim_secret={claim_secret}")
        self.assertEqual(poll_pending.status_code, status.HTTP_200_OK)
        self.assertEqual(poll_pending.data["status"], "pending")

        # 5. Phone approves QR payload
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {phone_token}")
        app_res = self.client.post("/api/v1/auth/qr/approve", {"qr_token": qr_res.data["qr_payload"]}, format="json")
        self.assertEqual(app_res.status_code, status.HTTP_200_OK)

        # 6. Browser polls -> approved -> claims single-use session
        self.client.credentials()
        poll_ok = self.client.get(f"/api/v1/auth/qr/status?token={qr_token}&claim_secret={claim_secret}")
        self.assertEqual(poll_ok.data["status"], "approved")

        claim_res = self.client.post(
            "/api/v1/auth/qr/claim",
            {"qr_token": qr_token, "claim_secret": claim_secret},
            format="json",
        )
        self.assertEqual(claim_res.status_code, status.HTTP_200_OK)
        self.assertTrue(claim_res.data["token"])
        companion_session = UserSession.objects.get(id=claim_res.data["session_id"])
        self.assertEqual(companion_session.auth_method, "qr")
        self.assertEqual(str(companion_session.linked_by_session_id), r_phone.data["session_id"])

        # 7. Second claim fails (single-use)
        claim_replay = self.client.post(
            "/api/v1/auth/qr/claim",
            {"qr_token": qr_token, "claim_secret": claim_secret},
            format="json",
        )
        self.assertEqual(claim_replay.status_code, status.HTTP_400_BAD_REQUEST)

    def test_totp_mfa_setup_login_backup_and_disable(self):
        r_login = self._login("mfa-device-1", "web")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r_login.data['token']}")

        # Begin MFA setup
        setup_res = self.client.post("/api/v1/auth/mfa/setup", {}, format="json")
        self.assertEqual(setup_res.status_code, status.HTTP_200_OK)
        secret = setup_res.data["secret"]
        self.assertIn("otpauth://totp/", setup_res.data["otpauth_uri"])

        # Enable MFA with live TOTP code
        code = compute_totp_code(secret)
        verify_res = self.client.post("/api/v1/auth/mfa/verify-setup", {"code": code}, format="json")
        self.assertEqual(verify_res.status_code, status.HTTP_200_OK)
        backup_codes = verify_res.data["backup_codes"]
        self.assertEqual(len(backup_codes), 8)
        self.assertTrue(MFAService.is_mfa_enabled(self.user))

        # Password login now requires 2FA challenge instead of granting immediate tokens
        self.client.credentials()
        login_mfa = self._login("mfa-device-2", "web")
        self.assertEqual(login_mfa.status_code, status.HTTP_200_OK)
        self.assertTrue(login_mfa.data.get("mfaRequired"))
        mfa_token = login_mfa.data["mfaToken"]
        self.assertNotIn("token", login_mfa.data)

        # Complete MFA login with one-time backup code
        mfa_verify = self.client.post(
            "/api/v1/auth/mfa/login-verify",
            {"mfa_token": mfa_token, "code": backup_codes[0]},
            format="json",
        )
        self.assertEqual(mfa_verify.status_code, status.HTTP_200_OK)
        self.assertTrue(mfa_verify.data["token"])

        # Used backup code cannot be reused; disable MFA using another backup code
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {mfa_verify.data['token']}")
        bad_disable = self.client.post(
            "/api/v1/auth/mfa/disable",
            {"password": "StrongPassword123!", "code": backup_codes[0]},
            format="json",
        )
        self.assertEqual(bad_disable.status_code, status.HTTP_400_BAD_REQUEST)

        good_disable = self.client.post(
            "/api/v1/auth/mfa/disable",
            {"password": "StrongPassword123!", "code": backup_codes[1]},
            format="json",
        )
        self.assertEqual(good_disable.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertFalse(MFAService.is_mfa_enabled(self.user))

    def test_promote_superadmin_command_and_admin_access(self):
        out = StringIO()
        call_command("promote_superadmin", email="sec_tester@example.com", stdout=out)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, "admin")
        self.assertTrue(self.user.is_staff)
        self.assertTrue(self.user.is_superuser)

        r_login = self._login("admin-dev-1", "web")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r_login.data['token']}")
        stats_res = self.client.get("/api/v1/admin/stats")
        self.assertEqual(stats_res.status_code, status.HTTP_200_OK)
        stats = stats_res.data["stats"]
        self.assertEqual(len(stats["dailyActivity"]), 7)
        self.assertIn("djangoAdminUrls", stats)
        self.assertIn("users", stats["djangoAdminUrls"])

        sess_res = self.client.get("/api/v1/admin/sessions")
        self.assertEqual(sess_res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(sess_res.data["sessions"]), 1)

        verify_res = self.client.get("/api/v1/admin/verify")
        self.assertTrue(verify_res.data["admin"])

        # Django Admin custom dashboard index renders registered models & analytics for superuser
        self.client.credentials()
        self.client.force_login(self.user)
        django_admin_res = self.client.get("/admin/")
        self.assertEqual(django_admin_res.status_code, status.HTTP_200_OK)
        html = django_admin_res.content.decode("utf-8")
        self.assertIn("Live System Overview", html)
        self.assertIn("/admin/authentication/usermfa/", html)
        self.assertIn("/admin/authentication/qrloginsession/", html)

        # Verify Django Admin changelists render 200 OK without RequestContext.__copy__ AttributeError
        for admin_path in (
            "/admin/authentication/user/",
            "/admin/authentication/blockeduser/",
            "/admin/authentication/usersession/",
            "/admin/auth/group/",
            "/admin/chat/conversation/",
            "/admin/messages_app/message/",
        ):
            res_cl = self.client.get(admin_path)
            self.assertEqual(res_cl.status_code, status.HTTP_200_OK, f"Admin changelist failed on {admin_path}")
