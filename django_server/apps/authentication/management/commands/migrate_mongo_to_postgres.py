import os
from django.core.management.base import BaseCommand
from django.utils import timezone
from pymongo import MongoClient

from apps.authentication.models import User, Request
from apps.chat.models import Chat
from apps.messages_app.models import Message


class Command(BaseCommand):
    help = "Migrate collections from MongoDB Atlas to PostgreSQL / Django models"

    def add_arguments(self, parser):
        parser.add_argument(
            "--mongo-uri",
            type=str,
            default=None,
            help="MongoDB connection URI (defaults to MONGO_URI in .env or .env.production)",
        )
        parser.add_argument(
            "--db-name",
            type=str,
            default="test",
            help="MongoDB database name (default: test)",
        )
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Clear existing data before migration",
        )

    def handle(self, *args, **options):
        mongo_uri = options.get("mongo_uri") or os.environ.get("MONGO_URI")
        if not mongo_uri:
            # Check server/.env.production or server/.env fallback if exists
            for env_path in ["../server/.env.production", "../server/.env", ".env"]:
                if os.path.exists(env_path):
                    with open(env_path, "r", encoding="utf-8") as f:
                        for line in f:
                            if line.strip().startswith("MONGO_URI="):
                                mongo_uri = line.split("=", 1)[1].strip().strip('"').strip("'")
                                break
                if mongo_uri:
                    break

        if not mongo_uri:
            raise CommandError("MONGO_URI not provided. Pass --mongo-uri or set MONGO_URI env var.")

        self.stdout.write(self.style.NOTICE("Connecting to MongoDB Atlas..."))
        client = MongoClient(mongo_uri)
        
        # Auto-detect database name from URI or use provided
        db_name = options.get("db_name", "test")
        mongo_db = client.get_default_database() or client[db_name]
        self.stdout.write(self.style.SUCCESS(f"Connected to MongoDB database: '{mongo_db.name}'"))

        if options.get("clear"):
            self.stdout.write(self.style.WARNING("Clearing existing PostgreSQL data..."))
            Message.objects.all().delete()
            Chat.objects.all().delete()
            Request.objects.all().delete()
            User.objects.all().delete()
            self.stdout.write(self.style.SUCCESS("Existing data cleared."))

        # ─── 1. Migrate Users ─────────────────────────────────────────────────
        self.stdout.write(self.style.NOTICE("\n[1/4] Migrating Users collection..."))
        users_col = mongo_db["users"]
        users_count = 0

        for doc in users_col.find():
            user_id = str(doc["_id"])
            username = doc.get("username", "").lower().strip()
            email = doc.get("email", "").lower().strip()
            name = doc.get("name", username)
            password = doc.get("password", "")
            avatar = doc.get("avatar", {})
            bio = doc.get("bio", "")
            status = doc.get("status", "online")
            privacy = doc.get("privacy", {"profile": "everyone"})
            starred = [str(mid) for mid in doc.get("starredMessages", [])]
            reset_token = doc.get("resetPasswordToken")
            reset_expires = doc.get("resetPasswordExpires")
            created_at = doc.get("createdAt") or timezone.now()

            role = "admin" if username == "admin" else "user"

            user, created = User.objects.update_or_create(
                id=user_id,
                defaults={
                    "username": username,
                    "email": email,
                    "name": name,
                    "password": password,  # Preserves existing bcrypt hash directly
                    "avatar": avatar if isinstance(avatar, dict) else {},
                    "bio": bio or "",
                    "status": status if status in ["online", "away", "busy", "dnd"] else "online",
                    "privacy": privacy if isinstance(privacy, dict) else {"profile": "everyone"},
                    "starred_messages": starred,
                    "reset_password_token": reset_token,
                    "reset_password_expires": reset_expires,
                    "role": role,
                    "is_active": True,
                }
            )
            users_count += 1

        self.stdout.write(self.style.SUCCESS(f"✓ Migrated {users_count} Users"))

        # ─── 2. Migrate Chats ─────────────────────────────────────────────────
        self.stdout.write(self.style.NOTICE("\n[2/4] Migrating Chats collection..."))
        chats_col = mongo_db["chats"]
        chats_count = 0

        for doc in chats_col.find():
            chat_id = str(doc["_id"])
            name = doc.get("name", "Chat")
            group_chat = bool(doc.get("groupChat", False))
            creator_id = str(doc.get("creator")) if doc.get("creator") else None
            avatar = doc.get("avatar", {})
            restricted = bool(doc.get("restrictedMessages", False))
            pinned = [str(pid) for pid in doc.get("pinnedMessages", [])]

            creator = User.objects.filter(id=creator_id).first() if creator_id else None

            chat, created = Chat.objects.update_or_create(
                id=chat_id,
                defaults={
                    "name": name,
                    "group_chat": group_chat,
                    "creator": creator,
                    "avatar": avatar if isinstance(avatar, dict) else {},
                    "restricted_messages": restricted,
                    "pinned_messages": pinned,
                }
            )

            # Assign members
            member_ids = [str(m) for m in doc.get("members", [])]
            valid_members = User.objects.filter(id__in=member_ids)
            chat.members.set(valid_members)

            # Assign admins
            admin_ids = [str(a) for a in doc.get("admins", [])]
            valid_admins = User.objects.filter(id__in=admin_ids)
            chat.admins.set(valid_admins)

            chats_count += 1

        self.stdout.write(self.style.SUCCESS(f"✓ Migrated {chats_count} Chats"))

        # ─── 3. Migrate Messages ──────────────────────────────────────────────
        self.stdout.write(self.style.NOTICE("\n[3/4] Migrating Messages collection..."))
        messages_col = mongo_db["messages"]
        messages_count = 0

        for doc in messages_col.find():
            msg_id = str(doc["_id"])
            sender_id = str(doc.get("sender")) if doc.get("sender") else None
            chat_id = str(doc.get("chat")) if doc.get("chat") else None

            sender = User.objects.filter(id=sender_id).first()
            chat = Chat.objects.filter(id=chat_id).first()

            if not sender or not chat:
                continue

            content = doc.get("content", "")
            attachments = doc.get("attachments", [])
            reply_to = doc.get("replyTo")
            if reply_to:
                reply_to = {"_id": str(reply_to)} if not isinstance(reply_to, dict) else reply_to

            reactions = []
            for r in doc.get("reactions", []):
                uid = str(r.get("user")) if r.get("user") else None
                u_obj = User.objects.filter(id=uid).first()
                if u_obj:
                    reactions.append({
                        "user": {
                            "_id": str(u_obj.id),
                            "name": u_obj.name,
                            "avatar": u_obj.avatar.get("url") if isinstance(u_obj.avatar, dict) else None,
                        },
                        "emoji": r.get("emoji", "👍"),
                    })

            is_edited = bool(doc.get("isEdited", False))
            is_deleted = bool(doc.get("isDeleted", False))
            read_by = [str(u) for u in doc.get("readBy", [])]

            Message.objects.update_or_create(
                id=msg_id,
                defaults={
                    "sender": sender,
                    "chat": chat,
                    "content": content,  # Keeps existing ENC: ciphertext or plaintext
                    "attachments": attachments if isinstance(attachments, list) else [],
                    "reply_to": reply_to,
                    "reactions": reactions,
                    "is_edited": is_edited,
                    "is_deleted": is_deleted,
                    "read_by": read_by,
                }
            )
            messages_count += 1

        self.stdout.write(self.style.SUCCESS(f"✓ Migrated {messages_count} Messages"))

        # ─── 4. Migrate Requests ──────────────────────────────────────────────
        self.stdout.write(self.style.NOTICE("\n[4/4] Migrating Requests collection..."))
        requests_col = mongo_db["requests"]
        requests_count = 0

        for doc in requests_col.find():
            req_id = str(doc["_id"])
            sender_id = str(doc.get("sender")) if doc.get("sender") else None
            receiver_id = str(doc.get("receiver")) if doc.get("receiver") else None

            sender = User.objects.filter(id=sender_id).first()
            receiver = User.objects.filter(id=receiver_id).first()

            if not sender or not receiver:
                continue

            status = doc.get("status", "pending")
            if status not in ["pending", "accepted", "rejected"]:
                status = "pending"

            Request.objects.update_or_create(
                id=req_id,
                defaults={
                    "sender": sender,
                    "receiver": receiver,
                    "status": status,
                }
            )
            requests_count += 1

        self.stdout.write(self.style.SUCCESS(f"✓ Migrated {requests_count} Requests"))

        self.stdout.write(self.style.SUCCESS("\n=========================================================="))
        self.stdout.write(self.style.SUCCESS("  MongoDB to PostgreSQL Migration Completed Successfully!"))
        self.stdout.write(self.style.SUCCESS("=========================================================="))
        self.stdout.write(f"Users:    {users_count}")
        self.stdout.write(f"Chats:    {chats_count}")
        self.stdout.write(f"Messages: {messages_count}")
        self.stdout.write(f"Requests: {requests_count}")
