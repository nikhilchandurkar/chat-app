# OAuth 2.0 Provider Integration & Security Setup

## 1. Overview

The platform supports OAuth 2.0 authentication for three major providers:
- **Google** (Identity & OpenID Connect)
- **GitHub** (Developer Identity)
- **Facebook / Meta** (Social Identity)

All OAuth flows are integrated through Django backend verification endpoints, ensuring that tokens, user profiles, and account bindings adhere to strict security policies.

---

## 2. Security Safeguards & Threat Mitigations

### 2.1. Verified Email Enforcement (Anti-Account Pre-Hijacking)
Many OAuth providers permit unverified email addresses on accounts (e.g., during registration before clicking a confirmation link).
- **Vulnerability**: If an attacker creates an unverified OAuth account using a victim's email address, and our platform automatically links accounts by email string, the attacker gains access to the victim's chat history.
- **Enforcement**: Our OAuth service (`oauth_service.py`) strictly verifies the `email_verified` boolean returned by the provider:
  - **Google**: Checks `payload.get('email_verified') is True`.
  - **GitHub**: Explicitly queries `https://api.github.com/user/emails` to ensure the matching email object has `verified: true`.
  - **Facebook**: Requires confirmed email from Graph API. If unverified or missing, authentication is rejected immediately with HTTP 400.

### 2.2. State Anti-CSRF Protection
To prevent Cross-Site Request Forgery during OAuth callbacks, client requests must submit a cryptographically random `state` parameter that is verified against the user's session cache before token exchange.

### 2.3. Transactional Alerts
Whenever an OAuth provider is linked or unlinked from a profile, an email notification is dispatched (`oauth_linked.html` / `oauth_unlinked.html`), informing the user of the account modification.

---

## 3. Provider Configuration

### 3.1. Google OAuth Setup

1. Navigate to the **[Google Cloud Console](https://console.cloud.google.com/)**.
2. Create a project or select an existing one.
3. Under **APIs & Services > OAuth consent screen**:
   - User Type: **External**.
   - App Name: `Secure Chat Platform`.
   - Authorized Domains: Add your domain (e.g. `yourdomain.com`).
   - Scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
4. Under **APIs & Services > Credentials**:
   - Click **Create Credentials > OAuth client ID**.
   - Application Type: **Web application**.
   - Authorized JavaScript origins:
     - `http://localhost:5173` (local dev)
     - `https://chat.yourdomain.com` (production)
   - Authorized redirect URIs:
     - `http://localhost:5173/auth/callback/google`
     - `https://chat.yourdomain.com/auth/callback/google`
     - `chatapp://oauth/callback` (for Android mobile app)
5. Copy the generated **Client ID** and **Client Secret** into your `.env`:
   ```dotenv
   GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   ```

---

### 3.2. GitHub OAuth Setup

1. Log in to GitHub and navigate to **Settings > Developer Settings > OAuth Apps**.
2. Click **New OAuth App**:
   - Application name: `Secure Chat Platform`.
   - Homepage URL: `https://chat.yourdomain.com`.
   - Authorization callback URL: `https://chat.yourdomain.com/auth/callback/github` (or `http://localhost:5173/auth/callback/github` locally).
3. Click **Register Application**.
4. Generate a new **Client Secret**.
5. Add the values to your `.env`:
   ```dotenv
   GITHUB_CLIENT_ID=your_github_client_id
   GITHUB_CLIENT_SECRET=your_github_client_secret
   ```

---

### 3.3. Facebook / Meta OAuth Setup

1. Go to **[Meta for Developers](https://developers.facebook.com/)**.
2. Click **My Apps > Create App**.
3. Select **Consumer / Authenticate and request data from users with Facebook Login**.
4. Under **Facebook Login > Settings**:
   - Client OAuth Settings:
     - Valid OAuth Redirect URIs:
       - `https://chat.yourdomain.com/auth/callback/facebook`
       - `http://localhost:5173/auth/callback/facebook`
5. Under **App Settings > Basic**:
   - Copy **App ID** and **App Secret**.
6. Add the values to your `.env`:
   ```dotenv
   FACEBOOK_APP_ID=your_facebook_app_id
   FACEBOOK_APP_SECRET=your_facebook_app_secret
   ```

---

## 4. Mobile OAuth Deep Linking (Android)

For the React Native Android application:
1. The app initiates OAuth by launching an in-app browser session (`expo-web-browser` / `WebBrowser.openAuthSessionAsync`).
2. The authorization callback uses the custom URI scheme configured in `app.json`:
   ```json
   {
     "expo": {
       "scheme": "chatapp"
     }
   }
   ```
3. Upon receiving `chatapp://oauth/callback?code=...`, the mobile app extracts the authorization code and posts it to `/api/v1/auth/oauth/verify/` to receive the JWT access and refresh tokens.
4. Tokens are encrypted and stored directly in the Android Keystore using `expo-secure-store`.

