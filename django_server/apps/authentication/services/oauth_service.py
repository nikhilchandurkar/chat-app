import logging
import secrets
import hashlib
import requests
from datetime import timedelta
from django.utils import timezone
from django.conf import settings
from django.db import transaction
from apps.authentication.models import User, UserProfile, SocialAccount, Device, UserSession, RefreshToken, AuditLog
from apps.authentication.services.email_service import EmailNotificationService
from rest_framework_simplejwt.tokens import RefreshToken as SimpleRefreshToken

logger = logging.getLogger(__name__)


class OAuthService:
    @staticmethod
    def verify_google_token(id_token: str) -> dict:
        """Validates Google ID Token using Google's public tokeninfo endpoint."""
        url = f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
        resp = requests.get(url, timeout=10)
        if resp.status_code != 200:
            raise ValueError("Invalid Google ID token")
        data = resp.json()

        # Strict email verification check
        email_verified = data.get("email_verified")
        if str(email_verified).lower() not in ("true", "1") and not settings.DEBUG:
            raise ValueError("Google account email is not verified by Google.")

        expected_client_id = getattr(settings, "GOOGLE_CLIENT_ID", "")
        if expected_client_id and data.get("aud") != expected_client_id:
            logger.warning("Google ID token aud '%s' does not match '%s'", data.get("aud"), expected_client_id)
            if not settings.DEBUG:
                raise ValueError("Token audience does not match server client ID")

        return {
            "uid": data.get("sub"),
            "email": data.get("email", "").lower().strip(),
            "email_verified": True,
            "name": data.get("name", ""),
            "avatar_url": data.get("picture", ""),
            "raw": data,
        }

    @staticmethod
    def exchange_google_code(code: str, redirect_uri: str = "") -> dict:
        """Exchanges Google OAuth authorization code for verified user profile."""
        client_id = getattr(settings, "GOOGLE_CLIENT_ID", "")
        client_secret = getattr(settings, "GOOGLE_CLIENT_SECRET", "")

        token_url = "https://oauth2.googleapis.com/token"
        payload = {
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri or "http://localhost:5173/login",
        }
        resp = requests.post(token_url, data=payload, timeout=10)
        if resp.status_code != 200:
            logger.error("Google token exchange failed: %s", resp.text)
            raise ValueError(f"Failed to exchange Google code: {resp.text}")

        tokens = resp.json()
        id_token = tokens.get("id_token")
        if id_token:
            return OAuthService.verify_google_token(id_token)

        access_token = tokens.get("access_token")
        if not access_token:
            raise ValueError("No access token or ID token returned by Google")

        userinfo_resp = requests.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        if userinfo_resp.status_code != 200:
            raise ValueError("Failed to retrieve Google user profile")
        data = userinfo_resp.json()
        return {
            "uid": data.get("sub"),
            "email": data.get("email", "").lower().strip(),
            "email_verified": True,
            "name": data.get("name", ""),
            "avatar_url": data.get("picture", ""),
            "raw": data,
        }

    @staticmethod
    def exchange_github_code(code: str, redirect_uri: str = "") -> dict:
        """Exchanges GitHub OAuth authorization code for verified user profile."""
        client_id = getattr(settings, "GITHUB_CLIENT_ID", "")
        client_secret = getattr(settings, "GITHUB_CLIENT_SECRET", "")

        token_url = "https://github.com/login/oauth/access_token"
        headers = {"Accept": "application/json"}
        payload = {
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
        }
        if redirect_uri:
            payload["redirect_uri"] = redirect_uri

        token_resp = requests.post(token_url, json=payload, headers=headers, timeout=10)
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise ValueError(token_data.get("error_description", "Failed to obtain GitHub access token"))

        auth_headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github.v3+json"}
        user_resp = requests.get("https://api.github.com/user", headers=auth_headers, timeout=10)
        user_data = user_resp.json()

        email = user_data.get("email")
        email_verified = False

        emails_resp = requests.get("https://api.github.com/user/emails", headers=auth_headers, timeout=10)
        if emails_resp.status_code == 200:
            emails_list = emails_resp.json()
            primary_verified = next((e["email"] for e in emails_list if e.get("primary") and e.get("verified")), None)
            if primary_verified:
                email = primary_verified
                email_verified = True
            elif emails_list:
                email = emails_list[0].get("email")
                email_verified = bool(emails_list[0].get("verified"))

        if not email:
            email = f"gh_{user_data.get('id')}@github.local"
            email_verified = False

        return {
            "uid": str(user_data.get("id")),
            "email": email.lower().strip(),
            "email_verified": email_verified,
            "name": user_data.get("name") or user_data.get("login", ""),
            "avatar_url": user_data.get("avatar_url", ""),
            "raw": user_data,
        }

    @staticmethod
    def verify_facebook_token(access_token: str) -> dict:
        """Validates Facebook user access token with Graph API."""
        url = "https://graph.facebook.com/me"
        params = {
            "fields": "id,name,email,picture.width(250).height(250)",
            "access_token": access_token,
        }
        resp = requests.get(url, params=params, timeout=10)
        if resp.status_code != 200:
            raise ValueError("Invalid Facebook access token")
        data = resp.json()

        email = data.get("email")
        if not email:
            email = f"fb_{data.get('id')}@facebook.local"

        avatar_url = ""
        picture = data.get("picture", {}).get("data", {})
        if picture and not picture.get("is_silhouette"):
            avatar_url = picture.get("url", "")

        return {
            "uid": str(data.get("id")),
            "email": email.lower().strip(),
            "email_verified": bool(data.get("email")),
            "name": data.get("name", ""),
            "avatar_url": avatar_url,
            "raw": data,
        }

    @classmethod
    def authenticate_or_link_social(cls, provider: str, profile_data: dict, current_user=None, device_id="web-client", platform="web", app_version="1.0.0", ip_address=None, user_agent="") -> tuple[bool, str, dict]:
        uid = str(profile_data["uid"])
        email = profile_data.get("email", "").lower().strip()
        email_verified = profile_data.get("email_verified", False)
        name = profile_data.get("name", "")
        avatar_url = profile_data.get("avatar_url", "")
        now = timezone.now()

        with transaction.atomic():
            # Scenario 1: Explicit Account Linking for currently authenticated user
            if current_user and current_user.is_authenticated:
                existing = SocialAccount.objects.filter(provider=provider, uid=uid).first()
                if existing and existing.user != current_user:
                    return False, f"This {provider.capitalize()} account is already linked to another user.", {}

                SocialAccount.objects.update_or_create(
                    provider=provider,
                    uid=uid,
                    defaults={
                        "user": current_user,
                        "email": email,
                        "extra_data": profile_data.get("raw", {}),
                    }
                )

                # Send security notification
                EmailNotificationService.send_oauth_linked(
                    email=current_user.email,
                    user_name=current_user.name or current_user.username,
                    provider=provider,
                    provider_email=email,
                )

                AuditLog.objects.create(
                    user=current_user,
                    action=f"auth.oauth.linked.{provider}",
                    ip_address=ip_address,
                    user_agent=user_agent,
                    details={"provider": provider, "uid": uid}
                )
                return True, f"Successfully linked {provider.capitalize()} account.", {"user": current_user.id}

            # Scenario 2: Login via Social Provider
            social_account = SocialAccount.objects.filter(provider=provider, uid=uid).select_related("user").first()
            if social_account:
                user = social_account.user
                is_new_user = False
            else:
                # Anti-Account Hijacking Check:
                # Check if an existing account has this email
                existing_user = User.objects.filter(email=email).first() if email else None
                if existing_user:
                    # Security requirement: Never automatically merge accounts solely because email strings match!
                    # Only allow merge if the provider confirmed email verification
                    if not email_verified and not settings.DEBUG:
                        return False, (
                            f"An account already exists for {email}, but this {provider.title()} account's email is not verified. "
                            f"Please sign in with Email OTP first, then link your {provider.title()} account in settings."
                        ), {}
                    user = existing_user
                    is_new_user = False
                else:
                    # Brand new user registration
                    base_username = (email.split("@")[0] if "@" in email else name.replace(" ", "_")).lower()
                    username = base_username
                    counter = 1
                    while User.objects.filter(username=username).exists():
                        username = f"{base_username}_{counter}"
                        counter += 1

                    user = User.objects.create_user(
                        email=email,
                        username=username,
                        name=name or base_username.capitalize(),
                        role="user"
                    )
                    is_new_user = True
                    if avatar_url:
                        user.avatar = {"public_id": "oauth_avatar", "url": avatar_url}
                        user.save(update_fields=["avatar"])

                # Link the social account
                SocialAccount.objects.create(
                    user=user,
                    provider=provider,
                    uid=uid,
                    email=email,
                    extra_data=profile_data.get("raw", {})
                )

            # Ensure profile exists
            UserProfile.objects.get_or_create(user=user, defaults={"display_name": user.name or user.username})

            # Register device
            device, _ = Device.objects.update_or_create(
                user=user,
                device_id=device_id,
                defaults={
                    "platform": platform,
                    "app_version": app_version,
                    "is_active": True,
                    "last_active_at": now,
                }
            )

            # Create UserSession
            session_token = secrets.token_hex(32)
            session = UserSession.objects.create(
                user=user,
                device=device,
                session_token=session_token,
                ip_address=ip_address,
                user_agent=user_agent,
                expires_at=now + timedelta(days=30),
                is_revoked=False
            )

            # Generate JWT Token Pair
            refresh = SimpleRefreshToken.for_user(user)
            access_token = str(refresh.access_token)
            jti = refresh.get("jti")
            token_hash = hashlib.sha256(str(refresh).encode()).hexdigest()

            RefreshToken.objects.create(
                user=user,
                session=session,
                token_hash=token_hash,
                jti=jti,
                expires_at=now + timedelta(days=30),
                is_revoked=False
            )

            AuditLog.objects.create(
                user=user,
                action=f"auth.login.oauth.{provider}",
                ip_address=ip_address,
                user_agent=user_agent,
                details={"provider": provider, "uid": uid, "is_new_user": is_new_user}
            )

        if is_new_user and email:
            EmailNotificationService.send_welcome(email=email, user_name=user.name or user.username)

        return True, "Authentication successful.", {
            "user": {
                "id": str(user.id),
                "_id": str(user.id),
                "email": user.email,
                "username": user.username,
                "name": user.name,
                "avatar": user.avatar,
                "role": user.role,
                "is_new_user": is_new_user,
            },
            "tokens": {
                "access": access_token,
                "refresh": str(refresh),
            },
            "session_id": str(session.id),
        }

    @classmethod
    def unlink_provider(cls, user, provider: str) -> tuple[bool, str]:
        """Safely unlinks an OAuth provider, ensuring user has at least email verification access."""
        provider = provider.lower().strip()
        account = SocialAccount.objects.filter(user=user, provider=provider).first()
        if not account:
            return False, f"No linked {provider.capitalize()} account found."

        # Verify user still has an active email to log in with
        if not user.email:
            remaining_providers = SocialAccount.objects.filter(user=user).exclude(provider=provider).count()
            if remaining_providers == 0:
                return False, "Cannot unlink your only authentication provider. Add an email address first."

        account.delete()

        EmailNotificationService.send_oauth_unlinked(
            email=user.email,
            user_name=user.name or user.username,
            provider=provider
        )

        AuditLog.objects.create(
            user=user,
            action=f"auth.oauth.unlinked.{provider}",
            details={"provider": provider}
        )

        return True, f"Successfully unlinked {provider.capitalize()} account."
