from django.test import TestCase
from django.utils import timezone
from django.core.cache import cache
from datetime import timedelta
from rest_framework.test import APIClient
from apps.authentication.models import User, EmailOTP, Device, UserSession
from apps.authentication.services.otp_service import OTPService
from apps.authentication.services.session_service import SessionService


class AuthOTPTestCase(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.email = "testuser@example.com"
        EmailOTP.objects.filter(email=self.email).delete()

    def test_otp_request_and_cooldown(self):
        # 1. Request OTP
        resp = self.client.post("/api/v1/auth/otp/request", {"email": self.email})
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["success"])

        otp_record = EmailOTP.objects.filter(email=self.email).first()
        self.assertIsNotNone(otp_record)
        self.assertFalse(otp_record.is_used)

        # 2. Immediate second request should be rejected by 60s cooldown
        resp2 = self.client.post("/api/v1/auth/otp/request", {"email": self.email})
        self.assertEqual(resp2.status_code, 429)

    def test_otp_verification_success(self):
        # Create known OTP
        known_code = "123456"
        EmailOTP.objects.create(
            email=self.email,
            hashed_otp=EmailOTP.hash_otp(self.email, known_code),
            purpose="login",
            expires_at=timezone.now() + timedelta(minutes=5),
            is_used=False
        )

        resp = self.client.post("/api/v1/auth/otp/verify", {
            "email": self.email,
            "otp": known_code,
            "device_id": "test-device-1",
            "platform": "web"
        })
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["success"])
        self.assertIn("token", resp.data)

        # Verify user was created
        user = User.objects.filter(email=self.email).first()
        self.assertIsNotNone(user)

        # Verify device was registered
        device = Device.objects.filter(user=user, device_id="test-device-1").first()
        self.assertIsNotNone(device)
        self.assertTrue(device.is_active)

    def test_otp_invalid_attempts_limit(self):
        known_code = "654321"
        otp_rec = EmailOTP.objects.create(
            email=self.email,
            hashed_otp=EmailOTP.hash_otp(self.email, known_code),
            purpose="login",
            expires_at=timezone.now() + timedelta(minutes=5),
            attempts=4,  # Next failure hits 5 max attempts
            is_used=False
        )

        resp = self.client.post("/api/v1/auth/otp/verify", {
            "email": self.email,
            "otp": "000000",
        })
        self.assertEqual(resp.status_code, 400)
        otp_rec.refresh_from_db()
        self.assertEqual(otp_rec.attempts, 5)

        # Subsequent attempt should be locked out
        resp2 = self.client.post("/api/v1/auth/otp/verify", {
            "email": self.email,
            "otp": known_code,
        })
        self.assertEqual(resp2.status_code, 400)
        self.assertIn("invalidated", resp2.data["message"].lower())

    def test_session_revocation(self):
        user = User.objects.create_user(email="alice@example.com", username="alice")
        device = Device.objects.create(user=user, device_id="alice-phone", platform="android")
        session = UserSession.objects.create(
            user=user,
            device=device,
            session_token="sess-token-123",
            expires_at=timezone.now() + timedelta(days=7),
            is_revoked=False
        )

        # Revoke session
        success = SessionService.revoke_session(user, str(session.id))
        self.assertTrue(success)

        session.refresh_from_db()
        self.assertTrue(session.is_revoked)

    def test_password_login_success_and_failure(self):
        user = User.objects.create_user(
            email="passuser@example.com",
            username="passuser",
            password="MySecretPassword123!",
            name="Password User"
        )

        # 1. Login with username
        resp_username = self.client.post("/api/v1/auth/login", {
            "username": "passuser",
            "password": "MySecretPassword123!",
        })
        self.assertEqual(resp_username.status_code, 200)
        self.assertTrue(resp_username.data["success"])
        self.assertIn("token", resp_username.data)
        self.assertEqual(resp_username.data["user"]["username"], "passuser")

        # 2. Login with email
        resp_email = self.client.post("/api/v1/auth/login", {
            "username": "passuser@example.com",
            "password": "MySecretPassword123!",
        })
        self.assertEqual(resp_email.status_code, 200)
        self.assertTrue(resp_email.data["success"])

        # 3. Invalid password
        resp_bad_pass = self.client.post("/api/v1/auth/login", {
            "username": "passuser",
            "password": "WrongPassword123!",
        })
        self.assertEqual(resp_bad_pass.status_code, 401)
        self.assertFalse(resp_bad_pass.data["success"])

    def test_registration_with_email_otp(self):
        reg_email = "newuser@example.com"
        reg_username = "newchatuser"
        reg_password = "SecurePassword2026!"

        # 1. Password mismatch should fail
        mismatch_resp = self.client.post("/api/v1/auth/register/request", {
            "username": reg_username,
            "email": reg_email,
            "password": reg_password,
            "confirm_password": "DifferentPassword999!",
        })
        self.assertEqual(mismatch_resp.status_code, 400)

        # 2. Valid request sends OTP
        req_resp = self.client.post("/api/v1/auth/register/request", {
            "username": reg_username,
            "email": reg_email,
            "password": reg_password,
            "confirm_password": reg_password,
        })
        self.assertEqual(req_resp.status_code, 200)
        self.assertTrue(req_resp.data["success"])

        # Set known OTP to test verification
        known_otp = "889900"
        otp_rec = EmailOTP.objects.filter(email=reg_email, purpose="register").first()
        self.assertIsNotNone(otp_rec)
        otp_rec.hashed_otp = EmailOTP.hash_otp(reg_email, known_otp)
        otp_rec.save()

        # 3. Complete registration with OTP
        verify_resp = self.client.post("/api/v1/auth/register/verify", {
            "username": reg_username,
            "email": reg_email,
            "password": reg_password,
            "otp": known_otp,
            "name": "New Chat User"
        })
        self.assertEqual(verify_resp.status_code, 201)
        self.assertTrue(verify_resp.data["success"])
        self.assertIn("token", verify_resp.data)

        # 4. Verify user exists in database and can log in with password
        created_user = User.objects.filter(username=reg_username).first()
        self.assertIsNotNone(created_user)
        self.assertTrue(created_user.check_password(reg_password))

        login_resp = self.client.post("/api/v1/auth/login", {
            "username": reg_username,
            "password": reg_password,
        })
        self.assertEqual(login_resp.status_code, 200)
        self.assertTrue(login_resp.data["success"])

