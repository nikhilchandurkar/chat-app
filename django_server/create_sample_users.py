import os
import sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from apps.authentication.models import User, UserProfile, Contact, Request
from apps.chat.models import Conversation, ConversationMember
from apps.messages_app.models import Message

COMMON_PASSWORD = "pass123"

SAMPLE_USERS = [
    {
        "username": "test123",
        "email": "test123@example.com",
        "name": "test123",
        "bio": "Sample user test123",
        "avatar_seed": "test123",
    },
    {
        "username": "test1",
        "email": "test1@example.com",
        "name": "test123 1",
        "bio": "Sample user 1 (test123)",
        "avatar_seed": "test1",
    },
    {
        "username": "test2",
        "email": "test2@example.com",
        "name": "test123 2",
        "bio": "Sample user 2 (test123)",
        "avatar_seed": "test2",
    },
    {
        "username": "test3",
        "email": "test3@example.com",
        "name": "test123 3",
        "bio": "Sample user 3 (test123)",
        "avatar_seed": "test3",
    },
    {
        "username": "test4",
        "email": "test4@example.com",
        "name": "test123 4",
        "bio": "Sample user 4 (test123)",
        "avatar_seed": "test4",
    },
]

def run():
    print("=== Creating / Updating Sample Users ===")
    created_users = []

    for item in SAMPLE_USERS:
        user = User.objects.filter(username=item["username"]).first() or User.objects.filter(email=item["email"]).first()
        if not user:
            user = User(
                username=item["username"],
                email=item["email"],
                name=item["name"],
                bio=item["bio"],
                role="user",
                is_active=True,
            )
        else:
            user.username = item["username"]
            user.email = item["email"]
            user.name = item["name"]
            user.bio = item["bio"]
            user.is_active = True

        user.set_password(COMMON_PASSWORD)
        avatar_url = f"https://api.dicebear.com/7.x/bottts/svg?seed={item['avatar_seed']}"
        user.avatar = {
            "url": avatar_url,
            "public_id": f"avatars/{item['username']}",
        }
        user.save()

        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.display_name = item["name"]
        profile.avatar_url = avatar_url
        profile.about = item["bio"]
        profile.online_status = "offline"
        profile.hide_from_search = False
        profile.privacy_avatar = "everyone"
        profile.privacy_online = "everyone"
        profile.privacy_last_seen = "everyone"
        profile.save()

        created_users.append(user)
        print(f"✓ User ready: username='{user.username}', email='{user.email}', name='{user.name}'")

    # Connect with existing user if available
    existing_user = User.objects.filter(username="nikhilchandurkar24").first() or User.objects.exclude(username__in=[u.username for u in created_users]).first()
    all_active_users = list(created_users)
    if existing_user and existing_user not in all_active_users:
        all_active_users.append(existing_user)
        print(f"✓ Found existing user to connect: {existing_user.username}")

    print("\n=== Setting up Contacts & Direct Chats ===")
    # Create mutual contacts and direct chats between test users
    for i in range(len(created_users)):
        for j in range(i + 1, len(created_users)):
            u1 = created_users[i]
            u2 = created_users[j]

            # Contacts
            Contact.objects.get_or_create(user=u1, contact_user=u2, defaults={"alias": u2.name})
            Contact.objects.get_or_create(user=u2, contact_user=u1, defaults={"alias": u1.name})

            # Mutual friend requests marked accepted
            Request.objects.get_or_create(sender=u1, receiver=u2, defaults={"status": "accepted"})

            # Direct conversation
            conv = Conversation.objects.filter(
                type="direct",
                member_records__user=u1
            ).filter(member_records__user=u2).first()

            if not conv:
                conv = Conversation.objects.create(
                    type="direct",
                    creator=u1,
                    name=""
                )
                ConversationMember.objects.create(conversation=conv, user=u1, role="member")
                ConversationMember.objects.create(conversation=conv, user=u2, role="member")

                # Sample greeting
                Message.objects.create(
                    conversation=conv,
                    sender=u1,
                    content=f"Hey {u2.name}, this is a test message from {u1.name}!"
                )
                Message.objects.create(
                    conversation=conv,
                    sender=u2,
                    content=f"Hello {u1.name}! Everything is working smoothly."
                )
                print(f"✓ Direct chat established: {u1.username} <-> {u2.username}")

    # If existing user present, connect test123 and test1 to existing user
    if existing_user:
        for test_u in created_users[:2]:
            Contact.objects.get_or_create(user=test_u, contact_user=existing_user, defaults={"alias": existing_user.name or existing_user.username})
            Contact.objects.get_or_create(user=existing_user, contact_user=test_u, defaults={"alias": test_u.name})
            Request.objects.get_or_create(sender=test_u, receiver=existing_user, defaults={"status": "accepted"})

            conv = Conversation.objects.filter(
                type="direct",
                member_records__user=test_u
            ).filter(member_records__user=existing_user).first()

            if not conv:
                conv = Conversation.objects.create(
                    type="direct",
                    creator=test_u,
                    name=""
                )
                ConversationMember.objects.create(conversation=conv, user=test_u, role="member")
                ConversationMember.objects.create(conversation=conv, user=existing_user, role="member")

                Message.objects.create(
                    conversation=conv,
                    sender=test_u,
                    content=f"Hi {existing_user.name or existing_user.username}! I am {test_u.name} (sample user)."
                )
                print(f"✓ Direct chat established: {test_u.username} <-> {existing_user.username}")

    print("\n=== Setting up Sample Group Chat ===")
    group_name = "Test Group 123"
    group_conv = Conversation.objects.filter(type="group", name=group_name).first()
    if not group_conv:
        group_conv = Conversation.objects.create(
            type="group",
            group_chat=True,
            creator=created_users[0],
            name=group_name,
            avatar={"url": "https://api.dicebear.com/7.x/shapes/svg?seed=testgroup123"}
        )
        for u in all_active_users:
            ConversationMember.objects.get_or_create(
                conversation=group_conv,
                user=u,
                defaults={"role": "admin" if u == created_users[0] else "member"}
            )

        Message.objects.create(
            conversation=group_conv,
            sender=created_users[0],
            content="Welcome to Test Group 123! All sample accounts can test group chat features here."
        )
        print(f"✓ Group chat '{group_name}' created with {len(all_active_users)} members.")

    print("\n=== Done! All sample users successfully configured. ===")

if __name__ == "__main__":
    run()

