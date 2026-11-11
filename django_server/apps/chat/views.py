import uuid
import secrets
import hashlib
from datetime import timedelta
from django.utils import timezone
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from apps.authentication.models import User, BlockedUser, Contact
from apps.messages_app.models import Message
from apps.outbox.services.outbox_service import OutboxService
from .models import Conversation, ConversationMember, Group, PinnedMessage, InvitationLink
from .serializers import ChatDetailsSerializer


def get_recipient_ids(conversation, sender_id):
    """Returns member IDs excluding sender for notification/broadcast purposes."""
    return [str(m.user_id) for m in conversation.member_records.exclude(user_id=sender_id)]


class NewGroupChatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        name = request.data.get("name", "").strip()
        members_ids = request.data.get("members", [])

        if not name or len(members_ids) < 1:
            return Response(
                {"success": False, "message": "Group requires a name and at least 1 other member."},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            conversation = Conversation.objects.create(
                name=name,
                type="group",
                group_chat=True,
                creator=request.user
            )

            # Create group details
            Group.objects.create(
                conversation=conversation,
                name=name,
                description=request.data.get("description", "")
            )

            # Add creator as owner/admin
            ConversationMember.objects.create(
                conversation=conversation,
                user=request.user,
                role="owner"
            )
            conversation.admins.add(request.user)

            # Add members with blocking and privacy checks
            for uid in members_ids:
                try:
                    u = User.objects.get(id=uid)
                    if u == request.user:
                        continue
                    # Verify neither user blocked the other
                    if BlockedUser.objects.filter(user=u, blocked_user=request.user).exists() or BlockedUser.objects.filter(user=request.user, blocked_user=u).exists():
                        continue
                    # Check who can add to groups privacy setting
                    u_profile = getattr(u, "profile", None)
                    if u_profile and u_profile.who_can_add_to_groups == "nobody":
                        continue
                    if u_profile and u_profile.who_can_add_to_groups == "contacts":
                        if not Contact.objects.filter(user=u, contact_user=request.user).exists():
                            continue
                    ConversationMember.objects.get_or_create(conversation=conversation, user=u, defaults={"role": "member"})
                except User.DoesNotExist:
                    pass

            # Record outbox event
            all_member_ids = [str(m.user_id) for m in conversation.member_records.all()]
            OutboxService.create_outbox_event(
                event_type="group.member_added",
                conversation_id=str(conversation.id),
                payload={
                    "conversation_id": str(conversation.id),
                    "name": name,
                    "recipient_ids": all_member_ids,
                    "added_by": str(request.user.id),
                }
            )

        # Trigger background publish
        OutboxService.publish_pending()

        return Response({
            "success": True,
            "message": "Group created successfully.",
            "chatId": str(conversation.id),
            "chat": ChatDetailsSerializer(conversation).data
        }, status=status.HTTP_201_CREATED)


class CreateDirectChatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user_id = request.data.get("userId")
        if not user_id:
            return Response({"success": False, "message": "userId is required."}, status=status.HTTP_400_BAD_REQUEST)

        other_user = get_object_or_404(User, id=user_id)
        if other_user == request.user:
            return Response({"success": False, "message": "Cannot create conversation with yourself."}, status=status.HTTP_400_BAD_REQUEST)

        # Check blocking
        if BlockedUser.objects.filter(user=request.user, blocked_user=other_user).exists():
            return Response({"success": False, "message": "You have blocked this user."}, status=status.HTTP_403_FORBIDDEN)
        if BlockedUser.objects.filter(user=other_user, blocked_user=request.user).exists():
            return Response({"success": False, "message": "You cannot message this user."}, status=status.HTTP_403_FORBIDDEN)

        # Privacy check: who can message me
        target_profile = getattr(other_user, "profile", None)
        if target_profile and target_profile.who_can_message_me != "everyone":
            if target_profile.who_can_message_me == "nobody":
                return Response({"success": False, "message": "This user does not accept direct messages."}, status=status.HTTP_403_FORBIDDEN)
            if target_profile.who_can_message_me == "contacts":
                is_contact = Contact.objects.filter(user=other_user, contact_user=request.user).exists()
                if not is_contact:
                    return Response({"success": False, "message": "This user only accepts direct messages from contacts."}, status=status.HTTP_403_FORBIDDEN)

        # Check existing direct conversation
        conv = Conversation.objects.filter(
            type="direct",
            member_records__user=request.user
        ).filter(member_records__user=other_user).first()

        if not conv:
            with transaction.atomic():
                conv = Conversation.objects.create(type="direct", creator=request.user)
                ConversationMember.objects.create(conversation=conv, user=request.user, role="member")
                ConversationMember.objects.create(conversation=conv, user=other_user, role="member")

        return Response({
            "success": True,
            "chatId": str(conv.id),
            "chat": ChatDetailsSerializer(conv).data
        })


class MyChatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        memberships = ConversationMember.objects.filter(
            user=request.user
        ).select_related("conversation").prefetch_related("conversation__member_records__user")

        results = []
        for mem in memberships:
            c = mem.conversation
            # Fetch latest non-deleted, non-expired message
            last_msg = Message.objects.filter(
                conversation=c,
                is_deleted=False
            ).order_by("-created_at").first()

            if not c.group_chat:
                other_member = c.member_records.exclude(user=request.user).select_related("user").first()
                if not other_member:
                    continue
                other = other_member.user
                # Check profile avatar privacy
                other_profile = getattr(other, "profile", None)
                can_see_avatar = True
                if other_profile and other_profile.privacy_avatar == "nobody":
                    can_see_avatar = False
                elif other_profile and other_profile.privacy_avatar == "contacts":
                    can_see_avatar = Contact.objects.filter(user=other, contact_user=request.user).exists()

                avatar_url = other.avatar.get("url") if (can_see_avatar and isinstance(other.avatar, dict)) else None

                results.append({
                    "_id": str(c.id),
                    "id": str(c.id),
                    "name": other.name or other.username,
                    "username": other.username,
                    "groupChat": False,
                    "avatar": [avatar_url] if avatar_url else [],
                    "members": [str(other.id)],
                    "memberNames": [other.name],
                    "isPinned": mem.is_pinned,
                    "isMuted": mem.is_muted,
                    "isArchived": mem.is_archived,
                    "ephemeral_ttl": c.ephemeral_ttl,
                    "unreadCount": mem.unread_count,
                    "lastMessage": last_msg.decrypted_content if last_msg else "",
                    "lastMessageTime": last_msg.created_at.isoformat() if last_msg else c.updated_at.isoformat(),
                })
            else:
                members_list = [m.user for m in c.member_records.all()]
                avatars = []
                if isinstance(c.avatar, dict) and c.avatar.get("url"):
                    avatars.append(c.avatar.get("url"))
                else:
                    for m in members_list[:3]:
                        if isinstance(m.avatar, dict) and m.avatar.get("url"):
                            avatars.append(m.avatar.get("url"))

                results.append({
                    "_id": str(c.id),
                    "id": str(c.id),
                    "name": c.name,
                    "groupChat": True,
                    "avatar": avatars,
                    "members": [str(m.id) for m in members_list],
                    "memberNames": [m.name for m in members_list],
                    "isPinned": mem.is_pinned,
                    "isMuted": mem.is_muted,
                    "isArchived": mem.is_archived,
                    "ephemeral_ttl": c.ephemeral_ttl,
                    "unreadCount": mem.unread_count,
                    "lastMessage": last_msg.decrypted_content if last_msg else "",
                    "lastMessageTime": last_msg.created_at.isoformat() if last_msg else c.updated_at.isoformat(),
                })

        # Sort pinned chats first, then latest activity
        results.sort(key=lambda x: (not x.get("isPinned", False), x.get("lastMessageTime", "")), reverse=True)
        return Response({"success": True, "chats": results})


class MyGroupsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        memberships = ConversationMember.objects.filter(
            user=request.user,
            conversation__group_chat=True
        ).select_related("conversation")

        groups = [m.conversation for m in memberships]
        return Response({
            "success": True,
            "groups": ChatDetailsSerializer(groups, many=True).data
        })


class ChatDetailsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        chat = get_object_or_404(Conversation, id=id)
        if not chat.member_records.filter(user=request.user).exists():
            return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        return Response({"success": True, "chat": ChatDetailsSerializer(chat).data})

    def put(self, request, id):
        chat = get_object_or_404(Conversation, id=id)
        if not chat.admins.filter(id=request.user.id).exists() and chat.creator != request.user:
            return Response({"success": False, "message": "Only admins can modify group details."}, status=status.HTTP_403_FORBIDDEN)

        name = request.data.get("name")
        if name:
            chat.name = name.strip()
        if "avatar" in request.FILES:
            from django.core.files.storage import default_storage
            avatar_file = request.FILES["avatar"]
            filename = default_storage.save(f"avatars/group_{chat.id}_{avatar_file.name}", avatar_file)
            chat.avatar = {"public_id": filename, "url": f"/api/v1/media/{filename}"}
        chat.save()

        return Response({"success": True, "message": "Group updated successfully."})

    def delete(self, request, id):
        chat = get_object_or_404(Conversation, id=id)
        if chat.creator != request.user and not chat.admins.filter(id=request.user.id).exists():
            return Response({"success": False, "message": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        chat.delete()
        return Response({"success": True, "message": "Conversation deleted."})


class AddMembersView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        chat_id = request.data.get("chatId")
        members = request.data.get("members", [])
        chat = get_object_or_404(Conversation, id=chat_id)

        if not chat.admins.filter(id=request.user.id).exists() and chat.creator != request.user:
            return Response({"success": False, "message": "Only admins can add members."}, status=status.HTTP_403_FORBIDDEN)

        added = []
        for uid in members:
            try:
                u = User.objects.get(id=uid)
                # Check blocking
                if BlockedUser.objects.filter(user=u, blocked_user=request.user).exists() or BlockedUser.objects.filter(user=request.user, blocked_user=u).exists():
                    continue
                # Check group invite privacy
                u_profile = getattr(u, "profile", None)
                if u_profile and u_profile.who_can_add_to_groups == "nobody":
                    continue
                if u_profile and u_profile.who_can_add_to_groups == "contacts":
                    if not Contact.objects.filter(user=u, contact_user=request.user).exists():
                        continue
                ConversationMember.objects.get_or_create(conversation=chat, user=u, defaults={"role": "member"})
                added.append(str(u.id))
            except User.DoesNotExist:
                pass

        return Response({"success": True, "message": f"{len(added)} member(s) added successfully."})


class RemoveMembersView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        chat_id = request.data.get("chatId")
        user_id = request.data.get("userId")
        chat = get_object_or_404(Conversation, id=chat_id)

        if not chat.admins.filter(id=request.user.id).exists() and chat.creator != request.user:
            return Response({"success": False, "message": "Only admins can remove members."}, status=status.HTTP_403_FORBIDDEN)

        ConversationMember.objects.filter(conversation=chat, user_id=user_id).delete()
        chat.admins.remove(user_id)

        # Notify via outbox
        OutboxService.create_outbox_event(
            event_type="group.member_removed",
            conversation_id=str(chat.id),
            payload={
                "event": "group.member_removed",
                "conversation_id": str(chat.id),
                "removed_user_id": str(user_id),
                "recipient_ids": [str(m.user_id) for m in chat.member_records.all()] + [str(user_id)],
            }
        )
        OutboxService.publish_pending()

        return Response({"success": True, "message": "Member removed."})


class LeaveGroupView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, id):
        chat = get_object_or_404(Conversation, id=id)
        ConversationMember.objects.filter(conversation=chat, user=request.user).delete()
        chat.admins.remove(request.user)

        if not chat.member_records.exists():
            chat.delete()

        return Response({"success": True, "message": "Left group."})


class TogglePinConversationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        mem = get_object_or_404(ConversationMember, conversation_id=id, user=request.user)
        mem.is_pinned = not mem.is_pinned
        mem.save(update_fields=["is_pinned"])
        return Response({"success": True, "isPinned": mem.is_pinned})


class ToggleMuteConversationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        mem = get_object_or_404(ConversationMember, conversation_id=id, user=request.user)
        mem.is_muted = not mem.is_muted
        mem.save(update_fields=["is_muted"])
        return Response({"success": True, "isMuted": mem.is_muted})


class ToggleArchiveConversationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        mem = get_object_or_404(ConversationMember, conversation_id=id, user=request.user)
        mem.is_archived = not mem.is_archived
        mem.save(update_fields=["is_archived"])
        return Response({"success": True, "isArchived": mem.is_archived})


# ─── Disappearing Messages TTL Control ──────────────────────────────────────
class UpdateEphemeralTTLView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        chat = get_object_or_404(Conversation, id=id)
        if not chat.member_records.filter(user=request.user).exists():
            return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        if chat.group_chat and not (chat.admins.filter(id=request.user.id).exists() or chat.creator == request.user):
            return Response({"success": False, "message": "Only admins can change disappearing message settings."}, status=status.HTTP_403_FORBIDDEN)

        ttl = int(request.data.get("ephemeral_ttl", 0))
        valid_ttls = [0, 30, 60, 300, 3600, 86400, 604800]
        if ttl not in valid_ttls:
            return Response({"success": False, "message": f"Invalid TTL. Supported: {valid_ttls}"}, status=status.HTTP_400_BAD_REQUEST)

        chat.ephemeral_ttl = ttl
        chat.save(update_fields=["ephemeral_ttl"])

        recipient_ids = [str(m.user_id) for m in chat.member_records.all()]
        OutboxService.create_outbox_event(
            event_type="chat.ephemeral_updated",
            conversation_id=str(chat.id),
            payload={
                "event": "chat.ephemeral_updated",
                "conversation_id": str(chat.id),
                "ephemeral_ttl": ttl,
                "recipient_ids": recipient_ids,
            }
        )
        OutboxService.publish_pending()

        return Response({"success": True, "ephemeral_ttl": ttl, "message": f"Disappearing message timer updated to {ttl}s."})


# ─── Private Invitation Links ───────────────────────────────────────────────
class GenerateInvitationLinkView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        chat = get_object_or_404(Conversation, id=id)
        if not chat.member_records.filter(user=request.user).exists():
            return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        if chat.group_chat and not (chat.admins.filter(id=request.user.id).exists() or chat.creator == request.user):
            return Response({"success": False, "message": "Only admins can generate group invitations."}, status=status.HTTP_403_FORBIDDEN)

        max_uses = int(request.data.get("max_uses", 1))
        expiry_days = int(request.data.get("expiry_days", 7))
        expires_at = timezone.now() + timedelta(days=expiry_days)

        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

        invite = InvitationLink.objects.create(
            token_hash=token_hash,
            invitation_type="group" if chat.group_chat else "direct",
            conversation=chat,
            created_by=request.user,
            max_uses=max_uses,
            expires_at=expires_at
        )

        return Response({
            "success": True,
            "inviteId": str(invite.id),
            "token": raw_token,
            "inviteUrl": f"/invite/{raw_token}",
            "expiresAt": expires_at.isoformat(),
            "maxUses": max_uses,
        }, status=status.HTTP_201_CREATED)


class InspectInvitationLinkView(APIView):
    """Inspect invitation metadata safely without joining."""
    permission_classes = [IsAuthenticated]

    def get(self, request, token):
        token_hash = hashlib.sha256(token.strip().encode()).hexdigest()
        invite = InvitationLink.objects.filter(token_hash=token_hash).select_related("conversation", "created_by").first()
        if not invite or not invite.is_valid():
            return Response({"success": False, "message": "This invitation link is invalid or has expired."}, status=status.HTTP_404_NOT_FOUND)

        chat = invite.conversation
        return Response({
            "success": True,
            "invitation": {
                "id": str(invite.id),
                "type": invite.invitation_type,
                "name": chat.name if chat else "Direct Chat",
                "memberCount": chat.member_records.count() if chat else 2,
                "inviter": invite.created_by.name or invite.created_by.username,
                "expiresAt": invite.expires_at.isoformat(),
            }
        })


class AcceptInvitationLinkView(APIView):
    """Authenticated user accepts invitation to join conversation."""
    permission_classes = [IsAuthenticated]

    def post(self, request, token):
        token_hash = hashlib.sha256(token.strip().encode()).hexdigest()
        with transaction.atomic():
            invite = InvitationLink.objects.select_for_update().filter(token_hash=token_hash).select_related("conversation", "created_by").first()
            if not invite or not invite.is_valid():
                return Response({"success": False, "message": "This invitation link has expired, was revoked, or reached maximum uses."}, status=status.HTTP_400_BAD_REQUEST)

            chat = invite.conversation
            if not chat:
                return Response({"success": False, "message": "Target conversation no longer exists."}, status=status.HTTP_404_NOT_FOUND)

            # Check blocking
            if BlockedUser.objects.filter(user=invite.created_by, blocked_user=request.user).exists() or BlockedUser.objects.filter(user=request.user, blocked_user=invite.created_by).exists():
                return Response({"success": False, "message": "Unable to accept invitation due to user block status."}, status=status.HTTP_403_FORBIDDEN)

            mem, created = ConversationMember.objects.get_or_create(
                conversation=chat,
                user=request.user,
                defaults={"role": "member"}
            )

            invite.uses_count += 1
            if invite.max_uses > 0 and invite.uses_count >= invite.max_uses:
                invite.is_revoked = True
            invite.save(update_fields=["uses_count", "is_revoked"])

            recipient_ids = [str(m.user_id) for m in chat.member_records.all()]
            OutboxService.create_outbox_event(
                event_type="group.member_added",
                conversation_id=str(chat.id),
                payload={
                    "event": "group.member_added",
                    "conversation_id": str(chat.id),
                    "new_member_id": str(request.user.id),
                    "new_member_name": request.user.name or request.user.username,
                    "recipient_ids": recipient_ids,
                }
            )

        OutboxService.publish_pending()

        return Response({
            "success": True,
            "message": f"Successfully joined {chat.name}.",
            "chatId": str(chat.id),
            "chat": ChatDetailsSerializer(chat).data
        })


class RevokeInvitationLinkView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, id):
        invite = get_object_or_404(InvitationLink.objects.select_related("conversation"), id=id)
        chat = invite.conversation
        if chat and chat.creator != request.user and not chat.admins.filter(id=request.user.id).exists() and invite.created_by != request.user:
            return Response({"success": False, "message": "Permission denied to revoke this invitation."}, status=status.HTTP_403_FORBIDDEN)

        invite.is_revoked = True
        invite.save(update_fields=["is_revoked"])
        return Response({"success": True, "message": "Invitation link revoked."})


def _get_admin_chat_or_error(user, chat_id):
    """Validates chat existence and confirms user holds creator or admin privileges."""
    chat = get_object_or_404(Conversation, id=chat_id)
    if not (chat.creator == user or chat.admins.filter(id=user.id).exists()):
        return None, Response({"success": False, "message": "Only group admins can perform this action."}, status=status.HTTP_403_FORBIDDEN)
    return chat, None


class ToggleRestrictMessagesView(APIView):
    """Toggles whether only group admins can post messages in a group chat."""
    permission_classes = [IsAuthenticated]

    def put(self, request, id):
        chat, err = _get_admin_chat_or_error(request.user, id)
        if err:
            return err
        chat.restricted_messages = not chat.restricted_messages
        chat.save(update_fields=["restricted_messages"])
        return Response({"success": True, "restrictedMessages": chat.restricted_messages})


class ManageAdminView(APIView):
    """Promotes or demotes a conversation member to/from group admin."""
    permission_classes = [IsAuthenticated]
    action = "add"

    def post(self, request):
        chat_id = request.data.get("chatId")
        user_id = request.data.get("userId")
        if not chat_id or not user_id:
            return Response({"success": False, "message": "chatId and userId are required."}, status=status.HTTP_400_BAD_REQUEST)

        chat, err = _get_admin_chat_or_error(request.user, chat_id)
        if err:
            return err

        target = get_object_or_404(User, id=user_id)
        if not chat.member_records.filter(user=target).exists():
            return Response({"success": False, "message": "User is not a member of this group."}, status=status.HTTP_400_BAD_REQUEST)

        if self.action == "add":
            chat.admins.add(target)
            msg = f"{target.name or target.username} promoted to admin."
        else:
            if chat.creator == target:
                return Response({"success": False, "message": "Cannot demote group creator."}, status=status.HTTP_400_BAD_REQUEST)
            chat.admins.remove(target)
            msg = f"{target.name or target.username} demoted to member."

        return Response({"success": True, "message": msg})


class GetPinnedMessagesView(APIView):
    """Returns active pinned messages for a conversation member."""
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        chat = get_object_or_404(Conversation, id=id)
        if not chat.member_records.filter(user=request.user).exists():
            return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        from apps.messages_app.serializers import MessageSerializer
        pins = PinnedMessage.objects.filter(conversation=chat).select_related("message", "message__sender").order_by("pinned_at")
        return Response({"success": True, "pinnedMessages": MessageSerializer([p.message for p in pins], many=True, context={"request": request}).data})


class PinMessageActionView(APIView):
    """Pins or unpins a specific message within a conversation."""
    permission_classes = [IsAuthenticated]

    def _get_authorized_chat(self, user, chat_id):
        chat = get_object_or_404(Conversation, id=chat_id)
        if not chat.member_records.filter(user=user).exists():
            return None, Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        if chat.type == "group":
            return _get_admin_chat_or_error(user, chat_id)
        return chat, None

    def post(self, request, id, message_id):
        chat, err = self._get_authorized_chat(request.user, id)
        if err:
            return err
        msg = get_object_or_404(Message, id=message_id, conversation=chat)
        PinnedMessage.objects.get_or_create(conversation=chat, message=msg, defaults={"pinned_by": request.user})
        return Response({"success": True, "message": "Message pinned."})

    def delete(self, request, id, message_id):
        chat, err = self._get_authorized_chat(request.user, id)
        if err:
            return err
        PinnedMessage.objects.filter(conversation=chat, message_id=message_id).delete()
        return Response({"success": True, "message": "Message unpinned."})
