import os
from django.core.files.storage import default_storage
from django.core.paginator import Paginator
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from apps.authentication.models import User
from .models import Chat
from .serializers import ChatDetailsSerializer


def emit_socket_event(event_name, data, user_ids):
    """Helper to broadcast real-time events to user Channels groups."""
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
    for uid in user_ids:
        async_to_sync(channel_layer.group_send)(
            f"user_{uid}",
            {
                "type": "chat.event",
                "event": event_name,
                "data": data,
            }
        )


class NewGroupChatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        name = request.data.get("name", "").strip()
        members_ids = request.data.get("members", [])

        if not name or len(members_ids) < 2:
            return Response(
                {"success": False, "message": "Group chat requires a name and at least 2 other members"},
                status=status.HTTP_400_BAD_REQUEST
            )

        chat = Chat.objects.create(name=name, group_chat=True, creator=request.user)
        members = list(User.objects.filter(id__in=members_ids))
        members.append(request.user)
        chat.members.set(members)
        chat.admins.add(request.user)

        # Broadcast refresh
        all_ids = [str(m.id) for m in members]
        emit_socket_event("REFETCH_CHATS", {}, all_ids)
        emit_socket_event("ALERT", f"Welcome to {chat.name}!", all_ids)

        return Response({"success": True, "message": "Group chat created"}, status=status.HTTP_201_CREATED)


class MyChatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        chats = Chat.objects.filter(members=request.user).prefetch_related("members")
        results = []

        for c in chats:
            if not c.group_chat:
                other = c.members.exclude(id=request.user.id).first()
                if not other:
                    continue
                avatar_url = other.avatar.get("url") if isinstance(other.avatar, dict) else None
                results.append({
                    "_id": str(c.id),
                    "name": other.name,
                    "groupChat": False,
                    "avatar": [avatar_url] if avatar_url else [],
                    "members": [str(other.id)],
                    "memberNames": [],
                })
            else:
                members_list = list(c.members.all())
                avatars = []
                if isinstance(c.avatar, dict) and c.avatar.get("url"):
                    avatars.append(c.avatar.get("url"))
                else:
                    for m in members_list[:3]:
                        if isinstance(m.avatar, dict) and m.avatar.get("url"):
                            avatars.append(m.avatar.get("url"))

                results.append({
                    "_id": str(c.id),
                    "name": c.name,
                    "groupChat": True,
                    "avatar": avatars,
                    "members": [str(m.id) for m in members_list],
                    "memberNames": [m.name for m in members_list],
                })

        return Response({"success": True, "chats": results})


class MyGroupsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        groups = Chat.objects.filter(group_chat=True, members=request.user).prefetch_related("members")
        results = []
        for g in groups:
            avatars = []
            if isinstance(g.avatar, dict) and g.avatar.get("url"):
                avatars.append(g.avatar.get("url"))
            else:
                for m in g.members.all()[:3]:
                    if isinstance(m.avatar, dict) and m.avatar.get("url"):
                        avatars.append(m.avatar.get("url"))

            results.append({
                "_id": str(g.id),
                "name": g.name,
                "groupChat": True,
                "avatar": avatars,
            })
        return Response({"success": True, "groups": results})


class ChatDetailsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        chat = get_object_or_404(Chat.objects.prefetch_related("members", "admins"), id=id)
        if not chat.members.filter(id=request.user.id).exists():
            return Response({"success": False, "message": "You are not a member of this chat"}, status=status.HTTP_403_FORBIDDEN)

        populate = request.query_params.get("populate", "false").lower() == "true"
        if populate:
            serializer = ChatDetailsSerializer(chat)
            return Response({"success": True, "chat": serializer.data})
        else:
            return Response({
                "success": True,
                "chat": {
                    "_id": str(chat.id),
                    "name": chat.name,
                    "groupChat": chat.group_chat,
                    "creator": str(chat.creator.id) if chat.creator else None,
                    "members": [str(m.id) for m in chat.members.all()],
                    "admins": [str(a.id) for a in chat.admins.all()],
                    "restrictedMessages": chat.restricted_messages,
                    "pinnedMessages": chat.pinned_messages,
                }
            })

    def put(self, request, id):
        chat = get_object_or_404(Chat, id=id)
        is_admin = chat.admins.filter(id=request.user.id).exists() or chat.creator_id == request.user.id
        if not is_admin:
            return Response({"success": False, "message": "Only admins can edit this group"}, status=status.HTTP_403_FORBIDDEN)

        name = request.data.get("name")
        if name:
            chat.name = name.strip()

        if "avatar" in request.FILES:
            avatar_file = request.FILES["avatar"]
            filename = default_storage.save(f"group_avatars/{chat.id}_{avatar_file.name}", avatar_file)
            chat.avatar = {
                "public_id": filename,
                "url": f"/api/v1/media/{filename}"
            }

        chat.save()
        serializer = ChatDetailsSerializer(chat)
        return Response({"success": True, "message": "Group updated successfully", "chat": serializer.data})

    def delete(self, request, id):
        chat = get_object_or_404(Chat, id=id)
        if chat.group_chat:
            if chat.creator_id != request.user.id:
                return Response({"success": False, "message": "Only group creator can delete this group"}, status=status.HTTP_403_FORBIDDEN)
        else:
            if not chat.members.filter(id=request.user.id).exists():
                return Response({"success": False, "message": "Unauthorized"}, status=status.HTTP_403_FORBIDDEN)

        all_member_ids = [str(m.id) for m in chat.members.all()]
        chat.delete()
        emit_socket_event("REFETCH_CHATS", {}, all_member_ids)
        return Response({"success": True, "message": "Chat deleted successfully"})


class AddMembersView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        chat_id = request.data.get("chatId")
        new_members_ids = request.data.get("members", [])
        chat = get_object_or_404(Chat, id=chat_id)

        is_admin = chat.admins.filter(id=request.user.id).exists() or chat.creator_id == request.user.id
        if not is_admin:
            return Response({"success": False, "message": "Only admins can add members"}, status=status.HTTP_403_FORBIDDEN)

        new_users = User.objects.filter(id__in=new_members_ids)
        chat.members.add(*new_users)

        all_ids = [str(m.id) for m in chat.members.all()]
        emit_socket_event("REFETCH_CHATS", {}, all_ids)
        return Response({"success": True, "message": "Members added successfully"})


class RemoveMemberView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        chat_id = request.data.get("chatId")
        user_id = request.data.get("userId")
        chat = get_object_or_404(Chat, id=chat_id)

        is_admin = chat.admins.filter(id=request.user.id).exists() or chat.creator_id == request.user.id
        if not is_admin:
            return Response({"success": False, "message": "Only admins can remove members"}, status=status.HTTP_403_FORBIDDEN)

        target_user = get_object_or_404(User, id=user_id)
        chat.members.remove(target_user)
        chat.admins.remove(target_user)

        all_ids = [str(m.id) for m in chat.members.all()] + [str(user_id)]
        emit_socket_event("REFETCH_CHATS", {}, all_ids)
        return Response({"success": True, "message": "Member removed successfully"})


class LeaveGroupView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, id):
        chat = get_object_or_404(Chat, id=id)
        if not chat.group_chat:
            return Response({"success": False, "message": "Cannot leave direct chat"}, status=status.HTTP_400_BAD_REQUEST)

        if chat.creator_id == request.user.id:
            other_member = chat.members.exclude(id=request.user.id).first()
            if other_member:
                chat.creator = other_member
                chat.admins.add(other_member)
            else:
                chat.delete()
                return Response({"success": True, "message": "Group deleted as last member left"})

        chat.members.remove(request.user)
        chat.admins.remove(request.user)
        chat.save()

        all_ids = [str(m.id) for m in chat.members.all()]
        emit_socket_event("REFETCH_CHATS", {}, all_ids)
        return Response({"success": True, "message": "Left group successfully"})


class ToggleRestrictedMessagesView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, id):
        chat = get_object_or_404(Chat, id=id)
        is_admin = chat.admins.filter(id=request.user.id).exists() or chat.creator_id == request.user.id
        if not is_admin:
            return Response({"success": False, "message": "Only admins can restrict messages"}, status=status.HTTP_403_FORBIDDEN)

        chat.restricted_messages = not chat.restricted_messages
        chat.save(update_fields=["restricted_messages"])
        msg = "Group is now restricted (Admins only)" if chat.restricted_messages else "Group is now unrestricted"
        return Response({"success": True, "message": msg})


class AddAdminView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        chat_id = request.data.get("chatId")
        user_id = request.data.get("userId")
        chat = get_object_or_404(Chat, id=chat_id)

        if chat.creator_id != request.user.id:
            return Response({"success": False, "message": "Only group creator can promote admins"}, status=status.HTTP_403_FORBIDDEN)

        user = get_object_or_404(User, id=user_id)
        chat.admins.add(user)
        return Response({"success": True, "message": "Member promoted to Admin"})


class RemoveAdminView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        chat_id = request.data.get("chatId")
        user_id = request.data.get("userId")
        chat = get_object_or_404(Chat, id=chat_id)

        if chat.creator_id != request.user.id:
            return Response({"success": False, "message": "Only group creator can demote admins"}, status=status.HTTP_403_FORBIDDEN)

        user = get_object_or_404(User, id=user_id)
        chat.admins.remove(user)
        return Response({"success": True, "message": "Admin demoted to Member"})


class GetPinnedMessagesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, chat_id):
        chat = get_object_or_404(Chat, id=chat_id)
        from apps.messages_app.models import Message
        pins = Message.objects.filter(id__in=chat.pinned_messages).select_related("sender")
        results = []
        for m in pins:
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
        return Response({"success": True, "pinnedMessages": results})


class PinMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, chat_id, message_id):
        chat = get_object_or_404(Chat, id=chat_id)
        pins = list(chat.pinned_messages or [])
        msg_id_str = str(message_id)

        if msg_id_str in pins:
            return Response({"success": True, "message": "Message already pinned"})

        if len(pins) >= 3:
            pins.pop(0)  # Maintain FIFO max 3

        pins.append(msg_id_str)
        chat.pinned_messages = pins
        chat.save(update_fields=["pinned_messages"])
        return Response({"success": True, "message": "Message pinned"})


class UnpinMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, chat_id, message_id):
        chat = get_object_or_404(Chat, id=chat_id)
        pins = list(chat.pinned_messages or [])
        msg_id_str = str(message_id)

        if msg_id_str in pins:
            pins.remove(msg_id_str)
            chat.pinned_messages = pins
            chat.save(update_fields=["pinned_messages"])

        return Response({"success": True, "message": "Message unpinned"})


class SendAttachmentsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        chat_id = request.data.get("chatId")
        chat = get_object_or_404(Chat, id=chat_id)
        from apps.messages_app.models import Message

        files = request.FILES.getlist("files")
        if not files or len(files) > 5:
            return Response({"success": False, "message": "Upload between 1 and 5 files"}, status=status.HTTP_400_BAD_REQUEST)

        attachments = []
        for f in files:
            saved_name = default_storage.save(f"attachments/{chat.id}_{f.name}", f)
            attachments.append({
                "public_id": saved_name,
                "url": f"/api/v1/media/{saved_name}"
            })

        message = Message.objects.create(
            sender=request.user,
            chat=chat,
            content=" ",
            attachments=attachments,
        )

        msg_data = {
            "_id": str(message.id),
            "content": " ",
            "attachments": attachments,
            "sender": str(request.user.id),
            "chat": str(chat.id),
            "createdAt": message.created_at.isoformat(),
        }

        all_member_ids = [str(m.id) for m in chat.members.all()]
        emit_socket_event("NEW_ATTACHMENT", {"message": msg_data}, all_member_ids)
        emit_socket_event("NEW_MESSAGE_ALERT", {"chatId": str(chat.id)}, all_member_ids)

        return Response({"success": True, "message": msg_data})


class GetChatMessagesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        chat = get_object_or_404(Chat, id=id)
        from apps.messages_app.models import Message

        messages_qs = Message.objects.filter(chat=chat).select_related("sender").order_by("-created_at")
        page_number = int(request.query_params.get("page", 1))
        paginator = Paginator(messages_qs, 20)
        page_obj = paginator.get_page(page_number)

        results = []
        for m in page_obj:
            results.append({
                "_id": str(m.id),
                "content": m.decrypted_content,
                "sender": {
                    "_id": str(m.sender.id),
                    "name": m.sender.name,
                    "avatar": m.sender.avatar.get("url") if isinstance(m.sender.avatar, dict) else None,
                },
                "chat": str(chat.id),
                "attachments": m.attachments or [],
                "isEdited": m.is_edited,
                "isDeleted": m.is_deleted,
                "reactions": m.reactions or [],
                "replyTo": m.reply_to,
                "readBy": m.read_by or [],
                "createdAt": m.created_at.isoformat(),
            })

        return Response({
            "success": True,
            "messages": results,
            "totalPages": paginator.num_pages,
        })

