import secrets
import hashlib
import os
from django.utils import timezone
from django.core.cache import cache
from django.contrib.auth import authenticate
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User, Request
from .serializers import (
    UserSerializer,
    RegisterSerializer,
    LoginSerializer,
    RequestOTPSerializer,
    VerifyOTPSerializer,
    FriendRequestSerializer,
)
from .permissions import IsAdminUserRole
from .tasks import send_otp_email_task, send_reset_password_email_task


def set_jwt_cookie(response, user):
    """Sets the chitChat-Token cookie matching the React frontend's expectations and includes token in response body for React Native mobile clients."""
    refresh = RefreshToken.for_user(user)
    access_token = str(refresh.access_token)
    response.set_cookie(
        key="chitChat-Token",
        value=access_token,
        max_age=15 * 24 * 60 * 60,
        httponly=True,
        samesite="None",
        secure=True,
    )
    if isinstance(response.data, dict):
        response.data["token"] = access_token
    return access_token


# ─── OTP Authentication (New Scalable Feature) ────────────────────────────────
class RequestOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RequestOTPSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "message": "Invalid email address"}, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data["email"].lower().strip()
        otp = f"{secrets.randbelow(900000) + 100000}"

        # Cache in Redis for 5 minutes (300 seconds)
        cache.set(f"otp:{email}", otp, timeout=300)

        # Send OTP asynchronously via Celery
        try:
            send_otp_email_task.delay(email, otp)
        except Exception:
            # If Celery worker is offline during local dev, log it
            print(f"[DEV] Generated OTP for {email}: {otp}")

        return Response({
            "success": True,
            "message": "A 6-digit verification code has been sent to your email."
        })


class VerifyOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyOTPSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "message": "Invalid email or OTP format"}, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data["email"].lower().strip()
        otp = serializer.validated_data["otp"].strip()

        cached_otp = cache.get(f"otp:{email}")
        if not cached_otp or cached_otp != otp:
            return Response({"success": False, "message": "Invalid or expired OTP code"}, status=status.HTTP_400_BAD_REQUEST)

        cache.delete(f"otp:{email}")

        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "username": email.split("@")[0],
                "name": email.split("@")[0].capitalize(),
                "role": "user",
            }
        )

        response = Response({
            "success": True,
            "message": f"Welcome back, {user.name}!",
            "user": UserSerializer(user).data
        })
        set_jwt_cookie(response, user)
        return response


# ─── Traditional User Registration & Login ────────────────────────────────────
class NewUserView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if not serializer.is_valid():
            error_msg = next(iter(serializer.errors.values()))[0]
            return Response({"success": False, "message": str(error_msg)}, status=status.HTTP_400_BAD_REQUEST)

        user = serializer.save()

        # Handle avatar file upload
        if "avatar" in request.FILES:
            avatar_file = request.FILES["avatar"]
            # Save file to media root
            from django.core.files.storage import default_storage
            filename = default_storage.save(f"avatars/{user.id}_{avatar_file.name}", avatar_file)
            user.avatar = {
                "public_id": filename,
                "url": f"/api/v1/media/{filename}"
            }
            user.save(update_fields=["avatar"])

        response = Response({
            "success": True,
            "message": "User Created",
            "user": UserSerializer(user).data
        }, status=status.HTTP_201_CREATED)
        set_jwt_cookie(response, user)
        return response


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"success": False, "message": "Username and password are required"}, status=status.HTTP_400_BAD_REQUEST)

        identifier = serializer.validated_data["username"].lower().strip()
        password = serializer.validated_data["password"]

        user = User.objects.filter(Q(username=identifier) | Q(email=identifier)).first()
        if not user or not user.check_password(password):
            return Response({"success": False, "message": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)

        response = Response({
            "success": True,
            "message": f"Welcome back, {user.name}!",
            "user": UserSerializer(user).data
        })
        set_jwt_cookie(response, user)
        return response


class GetMyProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            "success": True,
            "message": "User profile fetched",
            "user": UserSerializer(request.user).data
        })


class UpdateProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        user = request.user
        name = request.data.get("name")
        bio = request.data.get("bio")

        if name:
            user.name = name.strip()
        if bio is not None:
            user.bio = bio.strip()

        if "avatar" in request.FILES:
            avatar_file = request.FILES["avatar"]
            from django.core.files.storage import default_storage
            filename = default_storage.save(f"avatars/{user.id}_{avatar_file.name}", avatar_file)
            user.avatar = {
                "public_id": filename,
                "url": f"/api/v1/media/{filename}"
            }

        user.save()
        return Response({
            "success": True,
            "message": "Profile updated successfully",
            "user": UserSerializer(user).data
        })


class DeleteProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        user = request.user
        user.delete()
        response = Response({"success": True, "message": "Account deleted successfully"})
        response.delete_cookie("chitChat-Token")
        return response


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        current_password = request.data.get("currentPassword")
        new_password = request.data.get("newPassword")

        if not current_password or not new_password:
            return Response({"success": False, "message": "Please provide current and new password"}, status=status.HTTP_400_BAD_REQUEST)

        if len(new_password) < 8:
            return Response({"success": False, "message": "New password must be at least 8 characters"}, status=status.HTTP_400_BAD_REQUEST)

        if not request.user.check_password(current_password):
            return Response({"success": False, "message": "Current password is incorrect"}, status=status.HTTP_401_UNAUTHORIZED)

        request.user.set_password(new_password)
        request.user.save()
        return Response({"success": True, "message": "Password changed successfully"})


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        if not email:
            return Response({"success": False, "message": "Please provide your email address"}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(email=email).first()
        if not user:
            return Response({"success": True, "message": "If an account exists with that email, a reset link has been sent."})

        raw_token = secrets.token_hex(32)
        hashed_token = hashlib.sha256(raw_token.encode()).hexdigest()

        user.reset_password_token = hashed_token
        user.reset_password_expires = timezone.now() + timezone.timedelta(hours=1)
        user.save(update_fields=["reset_password_token", "reset_password_expires"])

        client_url = os.environ.get("CLIENT_URL", "https://nikhil-chats.chickenkiller.com")
        reset_url = f"{client_url}/reset-password?token={raw_token}&email={user.email}"

        print(f"[DEV] Reset Password Link for {user.email}: {reset_url}")
        try:
            send_reset_password_email_task.delay(user.email, reset_url, user.name)
        except Exception:
            pass

        return Response({"success": True, "message": "If an account exists with that email, a reset link has been sent."})


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.data.get("token")
        email = request.data.get("email", "").strip().lower()
        new_password = request.data.get("newPassword")

        if not token or not email or not new_password:
            return Response({"success": False, "message": "Invalid reset request"}, status=status.HTTP_400_BAD_REQUEST)

        if len(new_password) < 8:
            return Response({"success": False, "message": "Password must be at least 8 characters"}, status=status.HTTP_400_BAD_REQUEST)

        hashed_token = hashlib.sha256(token.encode()).hexdigest()
        user = User.objects.filter(
            email=email,
            reset_password_token=hashed_token,
            reset_password_expires__gt=timezone.now()
        ).first()

        if not user:
            return Response({"success": False, "message": "Reset link is invalid or has expired."}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.reset_password_token = None
        user.reset_password_expires = None
        user.save()

        response = Response({"success": True, "message": "Password reset successfully. You are now logged in."})
        set_jwt_cookie(response, user)
        return response


class UpdateStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        new_status = request.data.get("status")
        valid_statuses = ["online", "away", "busy", "dnd"]
        if new_status not in valid_statuses:
            return Response({"success": False, "message": "Invalid status value"}, status=status.HTTP_400_BAD_REQUEST)

        request.user.status = new_status
        request.user.save(update_fields=["status"])
        return Response({"success": True, "message": "Status updated", "status": new_status})


class UpdatePrivacyView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        profile_privacy = request.data.get("profile")
        if profile_privacy not in ["everyone", "friends", "nobody"]:
            return Response({"success": False, "message": "Invalid privacy setting"}, status=status.HTTP_400_BAD_REQUEST)

        request.user.privacy = {"profile": profile_privacy}
        request.user.save(update_fields=["privacy"])
        return Response({"success": True, "message": "Privacy settings updated", "privacy": request.user.privacy})


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        response = Response({"success": True, "message": "Logout successful"})
        response.delete_cookie("chitChat-Token")
        return response


class SearchUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = request.query_params.get("name", "").strip()
        page = int(request.query_params.get("page", 1))
        limit = int(request.query_params.get("limit", 10))

        # Exclude self and existing friends
        users_qs = User.objects.filter(name__icontains=query).exclude(id=request.user.id)
        start = (page - 1) * limit
        end = start + limit
        users = users_qs[start:end]

        results = []
        for u in users:
            can_see = u.privacy.get("profile") == "everyone" if isinstance(u.privacy, dict) else True
            results.append({
                "_id": str(u.id),
                "name": u.name,
                "avatar": u.avatar.get("url") if (can_see and isinstance(u.avatar, dict)) else None,
            })

        return Response({"success": True, "message": "Users fetched successfully", "users": results})


class SendFriendRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        target_user_id = request.data.get("userId")
        if str(request.user.id) == str(target_user_id):
            return Response({"success": False, "message": "Cannot send friend request to yourself"}, status=status.HTTP_400_BAD_REQUEST)

        target_user = User.objects.filter(id=target_user_id).first()
        if not target_user:
            return Response({"success": False, "message": "User not found"}, status=status.HTTP_404_NOT_FOUND)

        req, created = Request.objects.get_or_create(sender=request.user, receiver=target_user)
        if not created:
            return Response({"success": False, "message": "Request already sent"}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"success": True, "message": "Friend request sent successfully"})


class AcceptFriendRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        request_id = request.data.get("requestId")
        accept = request.data.get("accept", True)

        req_obj = Request.objects.filter(id=request_id, receiver=request.user).first()
        if not req_obj:
            return Response({"success": False, "message": "Request not found or unauthorized"}, status=status.HTTP_404_NOT_FOUND)

        if not accept:
            req_obj.delete()
            return Response({"success": True, "message": "Request rejected"})

        # Create Direct Chat between sender and receiver
        from apps.chat.models import Chat
        chat = Chat.objects.create(
            name=f"{req_obj.sender.name} <==> {req_obj.receiver.name}",
            group_chat=False
        )
        chat.members.add(req_obj.sender, req_obj.receiver)
        req_obj.delete()

        return Response({
            "success": True,
            "message": "Friend request accepted",
            "senderId": str(req_obj.sender.id)
        })


class GetNotificationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        requests = Request.objects.filter(receiver=request.user).select_related("sender")
        all_requests = []
        for r in requests:
            all_requests.append({
                "_id": str(r.id),
                "sender": {
                    "_id": str(r.sender.id),
                    "name": r.sender.name,
                    "avatar": r.sender.avatar.get("url") if isinstance(r.sender.avatar, dict) else None,
                }
            })
        return Response({"success": True, "message": "Notifications fetched", "allRequests": all_requests})


class GetFriendsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.chat.models import Chat
        direct_chats = Chat.objects.filter(group_chat=False, members=request.user).prefetch_related("members")

        friends = []
        for chat in direct_chats:
            other = chat.members.exclude(id=request.user.id).first()
            if other:
                friends.append({
                    "_id": str(other.id),
                    "name": other.name,
                    "avatar": other.avatar.get("url") if isinstance(other.avatar, dict) else None,
                    "status": other.status
                })

        return Response({"success": True, "message": "Friends fetched successfully", "friends": friends})


class ToggleStarView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        starred = list(request.user.starred_messages or [])
        msg_id = str(id)
        if msg_id in starred:
            starred.remove(msg_id)
            message = "Message unstarred"
        else:
            starred.append(msg_id)
            message = "Message starred"

        request.user.starred_messages = starred
        request.user.save(update_fields=["starred_messages"])
        return Response({"success": True, "message": message})


class GetStarredMessagesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.messages_app.models import Message
        starred_ids = request.user.starred_messages or []
        messages = Message.objects.filter(id__in=starred_ids).select_related("sender")
        results = []
        for m in messages:
            results.append({
                "_id": str(m.id),
                "content": m.decrypted_content,
                "sender": {
                    "_id": str(m.sender.id),
                    "name": m.sender.name,
                    "avatar": m.sender.avatar.get("url") if isinstance(m.sender.avatar, dict) else None,
                },
                "createdAt": m.created_at.isoformat(),
            })
        return Response({"success": True, "message": "Starred messages fetched", "messages": results})


# ─── RBAC Admin Views (Admin Only) ────────────────────────────────────────────
class AdminVerifyView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        secret_key = request.data.get("secretKey")
        admin_secret = os.environ.get("ADMIN_SECRET_KEY", "chat_app_secret")
        if not secret_key or secret_key != admin_secret:
            return Response({"success": False, "message": "Invalid Admin Secret Key"}, status=status.HTTP_401_UNAUTHORIZED)

        response = Response({
            "success": True,
            "message": "Authenticated successfully, welcome admin"
        })
        response.set_cookie(
            key="chitChat-admin-token",
            value="admin_authenticated",
            max_age=24 * 60 * 60,
            httponly=True,
            samesite="None",
            secure=True,
        )
        return response


class AdminLogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        response = Response({"success": True, "message": "Admin logged out successfully"})
        response.delete_cookie("chitChat-admin-token")
        return response


class AdminUsersView(APIView):
    permission_classes = [IsAdminUserRole]

    def get(self, request):
        from apps.chat.models import Chat
        users = User.objects.all()
        results = []
        for u in users:
            groups_count = Chat.objects.filter(members=u, group_chat=True).count()
            friends_count = Chat.objects.filter(members=u, group_chat=False).count()
            results.append({
                "_id": str(u.id),
                "name": u.name,
                "username": u.username,
                "avatar": u.avatar.get("url") if isinstance(u.avatar, dict) else None,
                "groups": groups_count,
                "friends": friends_count,
            })
        return Response({"status": "success", "users": results})


class AdminChatsView(APIView):
    permission_classes = [IsAdminUserRole]

    def get(self, request):
        from apps.chat.models import Chat
        from apps.messages_app.models import Message
        chats = Chat.objects.all().prefetch_related("members", "creator")
        results = []
        for c in chats:
            total_members = c.members.count()
            total_messages = Message.objects.filter(chat=c).count()
            members_data = []
            for m in c.members.all()[:5]:
                members_data.append({
                    "_id": str(m.id),
                    "name": m.name,
                    "avatar": m.avatar.get("url") if isinstance(m.avatar, dict) else None
                })
            results.append({
                "_id": str(c.id),
                "groupChat": c.group_chat,
                "name": c.name,
                "avatar": [c.avatar.get("url")] if isinstance(c.avatar, dict) and c.avatar.get("url") else [],
                "members": members_data,
                "creator": {
                    "name": c.creator.name if c.creator else "Unknown",
                    "avatar": c.creator.avatar.get("url") if c.creator and isinstance(c.creator.avatar, dict) else None,
                } if c.creator else None,
                "totalMembers": total_members,
                "totalMessages": total_messages,
            })
        return Response({"status": "success", "chats": results})


class AdminMessagesView(APIView):
    permission_classes = [IsAdminUserRole]

    def get(self, request):
        from apps.messages_app.models import Message
        messages = Message.objects.all().select_related("sender", "chat").order_by("-created_at")[:100]
        results = []
        for m in messages:
            results.append({
                "_id": str(m.id),
                "content": m.decrypted_content,
                "attachments": m.attachments or [],
                "createdAt": m.created_at.isoformat(),
                "sender": {
                    "_id": str(m.sender.id),
                    "name": m.sender.name,
                    "avatar": m.sender.avatar.get("url") if isinstance(m.sender.avatar, dict) else None,
                },
                "chat": str(m.chat.id),
                "groupChat": m.chat.group_chat,
            })
        return Response({"status": "success", "messages": results})


class AdminStatsView(APIView):
    permission_classes = [IsAdminUserRole]

    def get(self, request):
        from apps.chat.models import Chat
        from apps.messages_app.models import Message

        users_count = User.objects.count()
        chats_count = Chat.objects.count()
        messages_count = Message.objects.count()
        groups_count = Chat.objects.filter(group_chat=True).count()

        # Last 7 days message count buckets
        now = timezone.now()
        last_7_days = []
        for i in range(6, -1, -1):
            day_start = now - timezone.timedelta(days=i)
            day_end = day_start + timezone.timedelta(days=1)
            count = Message.objects.filter(created_at__range=(day_start, day_end)).count()
            last_7_days.append(count)

        return Response({
            "success": True,
            "status": "success",
            "stats": {
                "usersCount": users_count,
                "totalChatsCount": chats_count,
                "groupsCount": groups_count,
                "messagesCount": messages_count,
                "last7DaysMessages": last_7_days,
            }
        })
