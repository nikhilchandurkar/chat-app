import uuid
import secrets
import hashlib
from datetime import timedelta
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from django.db import transaction
from django.db.models import OuterRef, Subquery
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from apps.authentication.models import User, BlockedUser, Contact
from apps.messages_app.models import Message
from apps.outbox.services.outbox_service import OutboxService
from .models import Conversation, ConversationMember, Group, GroupJoinRequest, PinnedMessage, InvitationLink
from .serializers import ChatDetailsSerializer


def get_recipient_ids(conversation, sender_id):
    """Returns member IDs excluding sender for notification/broadcast purposes."""
    return [str(m.user_id) for m in conversation.member_records.exclude(user_id=sender_id)]


def invalidate_user_chats_cache(user_ids):
    """Invalidates cached MyChatsView responses for the affected users."""
    if not user_ids:
        return
    try:
        cache.delete_many([f"my_chats_v2:{uid}" for uid in set(str(u) for u in user_ids if u)])
    except Exception:
        pass


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

        created_new = False
        if not conv:
            created_new = True
            with transaction.atomic():
                conv = Conversation.objects.create(type="direct", creator=request.user)
                ConversationMember.objects.create(conversation=conv, user=request.user, role="member")
                ConversationMember.objects.create(conversation=conv, user=other_user, role="member")
                outbox_entry = OutboxService.create_outbox_event(
                    event_type="chat.created",
                    conversation_id="",
                    payload={
                        "event": "chat.created",
                        "legacy_event": "REFETCH_CHATS",
                        "chatId": str(conv.id),
                        "recipient_ids": [str(request.user.id), str(other_user.id)],
                    },
                )
            OutboxService.publish_item(outbox_entry)

        return Response({
            "success": True,
            "chatId": str(conv.id),
            "chat": ChatDetailsSerializer(conv).data
        })


class MyChatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        use_redis = str(getattr(settings, "CACHES", {}).get("default", {}).get("BACKEND", "")).endswith("RedisCache")
        cache_key = f"my_chats_v2:{request.user.id}"
        if use_redis:
            try:
                cached = cache.get(cache_key)
                if cached is not None:
                    return Response({"success": True, "chats": cached})
            except Exception:
                pass

        memberships = list(
            ConversationMember.objects.filter(
                user=request.user, is_deleted_for_user=False
            )
            .select_related("conversation")
            .only(
                "id", "conversation_id", "user_id", "is_pinned", "is_muted", "mute_until",
                "is_archived", "cleared_at", "unread_count",
                "conversation__id", "conversation__name", "conversation__group_chat",
                "conversation__creator_id", "conversation__avatar", "conversation__ephemeral_ttl",
                "conversation__updated_at",
            )
        )
        if not memberships:
            return Response({"success": True, "chats": []})

        conv_ids = [m.conversation_id for m in memberships]

        # 1. Batch-fetch all co-members + profiles across user's conversations (eliminates N+1 queries)
        members_by_conv = {}
        other_user_ids = set()
        for cm in (
            ConversationMember.objects.filter(conversation_id__in=conv_ids)
            .exclude(user=request.user)
            .select_related("user", "user__profile")
            .only(
                "conversation_id", "user_id",
                "user__id", "user__name", "user__username", "user__avatar",
                "user__profile__privacy_avatar",
            )
        ):
            members_by_conv.setdefault(cm.conversation_id, []).append(cm.user)
            other_user_ids.add(cm.user_id)

        # 2. Batch-fetch contact privacy checks in one query
        contact_owner_ids = set(
            Contact.objects.filter(user_id__in=other_user_ids, contact_user=request.user).values_list("user_id", flat=True)
        ) if other_user_ids else set()

        # 3. Batch-fetch latest non-deleted message per conversation via indexed subquery
        last_msg_subq = Subquery(
            Message.objects.filter(conversation_id=OuterRef("pk"), is_deleted=False)
            .order_by("-created_at")
            .values("id")[:1]
        )
        last_msg_ids = [
            row["last_msg_id"]
            for row in Conversation.objects.filter(id__in=conv_ids).annotate(last_msg_id=last_msg_subq).values("last_msg_id")
            if row["last_msg_id"]
        ]
        last_msg_by_conv = {}
        if last_msg_ids:
            for msg in Message.objects.filter(id__in=last_msg_ids).only("id", "conversation_id", "content", "is_deleted", "created_at"):
                last_msg_by_conv[msg.conversation_id] = msg

        results = []
        now = timezone.now()
        expired_mute_ids = []
        for mem in memberships:
            if mem.is_muted and mem.mute_until and mem.mute_until <= now:
                mem.is_muted = False
                mem.mute_until = None
                expired_mute_ids.append(mem.id)

            c = mem.conversation
            raw_last = last_msg_by_conv.get(c.id)
            last_msg = raw_last if (raw_last and (not mem.cleared_at or raw_last.created_at > mem.cleared_at)) else None
            co_members = members_by_conv.get(c.id, [])

            if not c.group_chat:
                if not co_members:
                    if c.name == "Saved Messages" and c.creator_id == request.user.id:
                        results.append({
                            "_id": str(c.id),
                            "id": str(c.id),
                            "name": "Saved Messages",
                            "username": request.user.username,
                            "groupChat": False,
                            "isSavedMessages": True,
                            "avatar": [],
                            "members": [str(request.user.id)],
                            "memberNames": ["Saved Messages"],
                            "isPinned": mem.is_pinned,
                            "isMuted": mem.is_muted,
                            "muteUntil": mem.mute_until.isoformat() if mem.mute_until else None,
                            "isArchived": mem.is_archived,
                            "ephemeral_ttl": c.ephemeral_ttl,
                            "unreadCount": mem.unread_count,
                            "lastMessage": last_msg.decrypted_content if last_msg else "",
                            "lastMessageTime": last_msg.created_at.isoformat() if last_msg else c.updated_at.isoformat(),
                        })
                    continue
                other = co_members[0]
                other_profile = getattr(other, "profile", None)
                can_see_avatar = True
                if other_profile and other_profile.privacy_avatar == "nobody":
                    can_see_avatar = False
                elif other_profile and other_profile.privacy_avatar == "contacts":
                    can_see_avatar = other.id in contact_owner_ids

                avatar_url = other.avatar.get("url") if (can_see_avatar and isinstance(other.avatar, dict)) else None

                results.append({
                    "_id": str(c.id),
                    "id": str(c.id),
                    "name": other.name or other.username,
                    "username": other.username,
                    "groupChat": False,
                    "isSavedMessages": False,
                    "avatar": [avatar_url] if avatar_url else [],
                    "members": [str(other.id)],
                    "memberNames": [other.name],
                    "isPinned": mem.is_pinned,
                    "isMuted": mem.is_muted,
                    "muteUntil": mem.mute_until.isoformat() if mem.mute_until else None,
                    "isArchived": mem.is_archived,
                    "ephemeral_ttl": c.ephemeral_ttl,
                    "unreadCount": mem.unread_count,
                    "lastMessage": last_msg.decrypted_content if last_msg else "",
                    "lastMessageTime": last_msg.created_at.isoformat() if last_msg else c.updated_at.isoformat(),
                })
            else:
                members_list = [request.user] + co_members
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
                    "isSavedMessages": False,
                    "avatar": avatars,
                    "members": [str(m.id) for m in members_list],
                    "memberNames": [m.name for m in members_list],
                    "isPinned": mem.is_pinned,
                    "isMuted": mem.is_muted,
                    "muteUntil": mem.mute_until.isoformat() if mem.mute_until else None,
                    "isArchived": mem.is_archived,
                    "ephemeral_ttl": c.ephemeral_ttl,
                    "unreadCount": mem.unread_count,
                    "lastMessage": last_msg.decrypted_content if last_msg else "",
                    "lastMessageTime": last_msg.created_at.isoformat() if last_msg else c.updated_at.isoformat(),
                })

        if expired_mute_ids:
            ConversationMember.objects.filter(id__in=expired_mute_ids).update(is_muted=False, mute_until=None)

        # Sort pinned chats first, then latest activity
        results.sort(key=lambda x: (1 if x.get("isPinned") else 0, x.get("lastMessageTime", "")), reverse=True)
        if use_redis:
            try:
                cache.set(cache_key, results, timeout=8)
            except Exception:
                pass
        return Response({"success": True, "chats": results})


class MyGroupsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        memberships = (
            ConversationMember.objects.filter(user=request.user, conversation__group_chat=True)
            .select_related("conversation")
            .prefetch_related("conversation__members", "conversation__admins")
        )

        groups = [m.conversation for m in memberships]
        return Response({
            "success": True,
            "groups": ChatDetailsSerializer(groups, many=True).data
        })


class ChatDetailsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        chat = get_object_or_404(
            Conversation.objects.prefetch_related("members", "admins"),
            id=id,
        )
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
        mem = chat.member_records.filter(user=request.user).first()
        if not mem:
            return Response({"success": False, "message": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

        # In 1-on-1 DMs, deleting removes & clears chat only for the requesting user (never wipes the peer's history)
        if not chat.group_chat:
            mem.cleared_at = timezone.now()
            mem.is_deleted_for_user = True
            mem.unread_count = 0
            mem.save(update_fields=["cleared_at", "is_deleted_for_user", "unread_count"])
            _emit_member_sync(request.user.id, id)
            return Response({"success": True, "message": "Chat deleted for you."})

        if chat.creator != request.user and not chat.admins.filter(id=request.user.id).exists():
            return Response({"success": False, "message": "Only group admins can delete this group."}, status=status.HTTP_403_FORBIDDEN)

        chat.delete()
        return Response({"success": True, "message": "Group deleted."})


class ClearChatView(APIView):
    """Clears all existing messages in a chat ONLY for the requesting user without affecting other members."""
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        chat = get_object_or_404(Conversation, id=id)
        mem = chat.member_records.filter(user=request.user).first()
        if not mem:
            return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        mem.cleared_at = timezone.now()
        mem.unread_count = 0
        mem.save(update_fields=["cleared_at", "unread_count"])
        invalidate_user_chats_cache([request.user.id])

        entry = OutboxService.create_outbox_event(
            event_type="chat.cleared",
            conversation_id="",
            payload={
                "event": "chat.cleared",
                "legacy_event": "REFETCH_CHATS",
                "chatId": str(chat.id),
                "clearedAt": mem.cleared_at.isoformat(),
                "recipient_ids": [str(request.user.id)],
            },
        )
        OutboxService.publish_item(entry)
        return Response({"success": True, "message": "Chat cleared for you.", "clearedAt": mem.cleared_at.isoformat()})


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


def _emit_member_sync(user_id, chat_id):
    invalidate_user_chats_cache([user_id])
    entry = OutboxService.create_outbox_event(
        event_type="chat.member_updated",
        conversation_id="",
        payload={
            "event": "chat.member_updated",
            "legacy_event": "REFETCH_CHATS",
            "chatId": str(chat_id),
            "recipient_ids": [str(user_id)],
        },
    )
    OutboxService.publish_item(entry)


class TogglePinConversationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        mem = get_object_or_404(ConversationMember, conversation_id=id, user=request.user)
        mem.is_pinned = not mem.is_pinned
        mem.save(update_fields=["is_pinned"])
        _emit_member_sync(request.user.id, id)
        return Response({"success": True, "isPinned": mem.is_pinned})


class ToggleMuteConversationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        mem = get_object_or_404(ConversationMember, conversation_id=id, user=request.user)
        dur_hours = request.data.get("durationHours")
        explicit_mute = request.data.get("mute")

        if explicit_mute is False:
            mem.is_muted = False
            mem.mute_until = None
        elif dur_hours is not None:
            try:
                hours = int(dur_hours)
            except (TypeError, ValueError):
                hours = 0
            mem.is_muted = True
            mem.mute_until = timezone.now() + timedelta(hours=hours) if hours > 0 else None
        else:
            mem.is_muted = not mem.is_muted
            if not mem.is_muted:
                mem.mute_until = None

        mem.save(update_fields=["is_muted", "mute_until"])
        _emit_member_sync(request.user.id, id)
        return Response({
            "success": True,
            "isMuted": mem.is_muted,
            "muteUntil": mem.mute_until.isoformat() if mem.mute_until else None,
        })


class MarkUnreadView(APIView):
    """Marks a conversation as having unread messages for the current user."""
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        mem = get_object_or_404(ConversationMember, conversation_id=id, user=request.user)
        mem.unread_count = max(1, int(mem.unread_count or 0))
        mem.save(update_fields=["unread_count"])
        _emit_member_sync(request.user.id, id)
        return Response({"success": True, "unreadCount": mem.unread_count})


class SavedMessagesView(APIView):
    """Gets or creates the authenticated user's personal Saved Messages self-chat vault."""
    permission_classes = [IsAuthenticated]

    def _get_or_create_vault(self, user):
        vault = (
            Conversation.objects.filter(
                type="direct",
                group_chat=False,
                creator=user,
                name="Saved Messages",
                member_records__user=user,
            )
            .order_by("created_at")
            .first()
        )
        if vault and vault.member_records.count() == 1:
            mem = vault.member_records.filter(user=user).first()
            if mem and mem.is_deleted_for_user:
                mem.is_deleted_for_user = False
                mem.save(update_fields=["is_deleted_for_user"])
            return vault

        with transaction.atomic():
            vault = Conversation.objects.create(
                name="Saved Messages",
                type="direct",
                group_chat=False,
                creator=user,
            )
            ConversationMember.objects.create(
                conversation=vault,
                user=user,
                role="owner",
                is_pinned=True,
            )
        return vault

    def get(self, request):
        vault = self._get_or_create_vault(request.user)
        _emit_member_sync(request.user.id, vault.id)
        return Response({"success": True, "chatId": str(vault.id), "chat": ChatDetailsSerializer(vault).data})

    def post(self, request):
        vault = self._get_or_create_vault(request.user)
        _emit_member_sync(request.user.id, vault.id)
        return Response({"success": True, "chatId": str(vault.id), "chat": ChatDetailsSerializer(vault).data})


class ToggleArchiveConversationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        mem = get_object_or_404(ConversationMember, conversation_id=id, user=request.user)
        mem.is_archived = not mem.is_archived
        mem.save(update_fields=["is_archived"])
        _emit_member_sync(request.user.id, id)
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
        valid_ttls = [-1, -120, 0, 30, 60, 120, 300, 3600, 86400, 604800]
        if ttl not in valid_ttls:
            return Response({"success": False, "message": f"Invalid TTL. Supported: {valid_ttls}"}, status=status.HTTP_400_BAD_REQUEST)

        chat.ephemeral_ttl = ttl
        chat.save(update_fields=["ephemeral_ttl"])
        OutboxService.publish_item(
            OutboxService.create_outbox_event(
                event_type="chat.ephemeral_updated",
                conversation_id=str(chat.id),
                payload={
                    "event": "chat.ephemeral_updated",
                    "legacy_event": "REFETCH_CHATS",
                    "chatId": str(chat.id),
                    "ephemeral_ttl": ttl,
                    "recipient_ids": [str(m.user_id) for m in chat.member_records.all()],
                },
            )
        )
        return Response({"success": True, "ephemeral_ttl": ttl})

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
                "requireJoinApproval": bool(chat and chat.group_chat and chat.require_join_approval),
            }
        })


class AcceptInvitationLinkView(APIView):
    """Authenticated user accepts invitation to join conversation (or queues for admin approval)."""
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

            existing_member = ConversationMember.objects.filter(conversation=chat, user=request.user).first()
            if existing_member:
                if existing_member.is_deleted_for_user:
                    existing_member.is_deleted_for_user = False
                    existing_member.save(update_fields=["is_deleted_for_user"])
                return Response({
                    "success": True,
                    "message": f"You are already a member of {chat.name}.",
                    "chatId": str(chat.id),
                    "chat": ChatDetailsSerializer(chat).data,
                })

            if chat.group_chat and chat.require_join_approval:
                join_req, _created = GroupJoinRequest.objects.update_or_create(
                    conversation=chat,
                    user=request.user,
                    defaults={"invitation_link": invite, "status": "pending", "reviewed_by": None},
                )
                admin_ids = list(
                    {str(uid) for uid in ([chat.creator_id] if chat.creator_id else []) + list(chat.admins.values_list("id", flat=True))}
                )
                OutboxService.create_outbox_event(
                    event_type="group.join_requested",
                    conversation_id=str(chat.id),
                    payload={
                        "event": "group.join_requested",
                        "legacy_event": "REFETCH_CHATS",
                        "chatId": str(chat.id),
                        "requestId": str(join_req.id),
                        "requesterId": str(request.user.id),
                        "requesterName": request.user.name or request.user.username,
                        "recipient_ids": admin_ids,
                    },
                )
                transaction.on_commit(OutboxService.publish_pending)
                return Response({
                    "success": True,
                    "pendingApproval": True,
                    "message": f"Join request sent to {chat.name} admins for approval.",
                    "requestId": str(join_req.id),
                }, status=status.HTTP_202_ACCEPTED)

            ConversationMember.objects.get_or_create(
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
                    "legacy_event": "REFETCH_CHATS",
                    "conversation_id": str(chat.id),
                    "chatId": str(chat.id),
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


class ManageTopicView(APIView):
    """Creates or deletes a topic channel tag (#general, #gaming, etc.) in a group chat."""
    permission_classes = [IsAuthenticated]

    def post(self, request, id):
        chat = get_object_or_404(Conversation, id=id)
        if not chat.member_records.filter(user=request.user).exists():
            return Response({"success": False, "message": "Access denied."}, status=status.HTTP_403_FORBIDDEN)
        if chat.type != "group":
            return Response({"success": False, "message": "Topics are supported in group chats."}, status=status.HTTP_400_BAD_REQUEST)

        topic = (request.data.get("topic") or "").strip().lstrip("#")[:32]
        action = request.data.get("action", "add")
        if not topic:
            return Response({"success": False, "message": "Topic name is required."}, status=status.HTTP_400_BAD_REQUEST)

        topics = list(chat.topics or [])
        if action == "remove":
            topics = [t for t in topics if t.lower() != topic.lower()]
        elif not any(t.lower() == topic.lower() for t in topics):
            topics.append(topic)

        chat.topics = topics
        chat.save(update_fields=["topics"])

        OutboxService.publish_item(
            OutboxService.create_outbox_event(
                event_type="chat.topics_updated",
                conversation_id=str(chat.id),
                payload={
                    "event": "chat.topics_updated",
                    "legacy_event": "REFETCH_CHATS",
                    "chatId": str(chat.id),
                    "topics": topics,
                    "recipient_ids": [str(m.user_id) for m in chat.member_records.all()],
                },
            )
        )
        return Response({"success": True, "topics": topics})


class UpdateGroupModerationView(APIView):
    """Updates group moderation controls: slow_mode_seconds & require_join_approval."""
    permission_classes = [IsAuthenticated]

    def put(self, request, id):
        chat, err = _get_admin_chat_or_error(request.user, id)
        if err:
            return err
        if not chat.group_chat:
            return Response({"success": False, "message": "Only available for group chats."}, status=status.HTTP_400_BAD_REQUEST)

        updated_fields = []
        if "slow_mode_seconds" in request.data or "slowModeSeconds" in request.data:
            raw_slow = request.data.get("slow_mode_seconds", request.data.get("slowModeSeconds", 0))
            try:
                slow_sec = int(raw_slow)
            except (TypeError, ValueError):
                return Response({"success": False, "message": "Invalid slowModeSeconds."}, status=status.HTTP_400_BAD_REQUEST)
            valid_slow = [0, 5, 10, 15, 30, 60, 300]
            if slow_sec not in valid_slow:
                return Response({"success": False, "message": f"Supported slow mode durations: {valid_slow}"}, status=status.HTTP_400_BAD_REQUEST)
            chat.slow_mode_seconds = slow_sec
            updated_fields.append("slow_mode_seconds")

        if "require_join_approval" in request.data or "requireJoinApproval" in request.data:
            raw_req = request.data.get("require_join_approval", request.data.get("requireJoinApproval"))
            chat.require_join_approval = str(raw_req).lower() in ("1", "true", "yes") if isinstance(raw_req, str) else bool(raw_req)
            updated_fields.append("require_join_approval")

        if updated_fields:
            chat.save(update_fields=updated_fields)
            OutboxService.publish_item(
                OutboxService.create_outbox_event(
                    event_type="chat.moderation_updated",
                    conversation_id=str(chat.id),
                    payload={
                        "event": "chat.moderation_updated",
                        "legacy_event": "REFETCH_CHATS",
                        "chatId": str(chat.id),
                        "slowModeSeconds": chat.slow_mode_seconds,
                        "requireJoinApproval": chat.require_join_approval,
                        "recipient_ids": [str(m.user_id) for m in chat.member_records.all()],
                    },
                )
            )

        return Response({
            "success": True,
            "slowModeSeconds": chat.slow_mode_seconds,
            "requireJoinApproval": chat.require_join_approval,
        })


class GroupJoinRequestsView(APIView):
    """Lists pending invite-link join requests for a group admin/creator."""
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        chat, err = _get_admin_chat_or_error(request.user, id)
        if err:
            return err

        pending = GroupJoinRequest.objects.filter(conversation=chat, status="pending").select_related("user").order_by("created_at")
        items = [
            {
                "_id": str(jr.id),
                "user": {
                    "_id": str(jr.user.id),
                    "name": jr.user.name,
                    "username": jr.user.username,
                    "avatar": jr.user.avatar.get("url") if isinstance(jr.user.avatar, dict) else None,
                },
                "createdAt": jr.created_at.isoformat(),
            }
            for jr in pending
        ]
        return Response({"success": True, "requests": items})


class ReviewJoinRequestView(APIView):
    """Approves or rejects a pending group join request."""
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id):
        jr = get_object_or_404(GroupJoinRequest.objects.select_related("conversation", "user", "invitation_link"), id=request_id)
        chat, err = _get_admin_chat_or_error(request.user, jr.conversation_id)
        if err:
            return err

        approve = bool(request.data.get("approve", True))
        if jr.status != "pending":
            return Response({"success": False, "message": f"Request already {jr.status}."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            jr.status = "approved" if approve else "rejected"
            jr.reviewed_by = request.user
            jr.save(update_fields=["status", "reviewed_by", "updated_at"])

            if approve:
                ConversationMember.objects.get_or_create(
                    conversation=chat,
                    user=jr.user,
                    defaults={"role": "member"},
                )
                invite = jr.invitation_link
                if invite and invite.is_valid():
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
                        "legacy_event": "REFETCH_CHATS",
                        "conversation_id": str(chat.id),
                        "chatId": str(chat.id),
                        "new_member_id": str(jr.user.id),
                        "new_member_name": jr.user.name or jr.user.username,
                        "recipient_ids": recipient_ids,
                    },
                )
                transaction.on_commit(OutboxService.publish_pending)

        return Response({
            "success": True,
            "status": jr.status,
            "message": f"{'Approved' if approve else 'Rejected'} {jr.user.name or jr.user.username}.",
        })

