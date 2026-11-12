"""Promote an existing user to full Superadmin (`role='admin'`, `is_staff`, `is_superuser`)."""

from django.core.management.base import BaseCommand, CommandError

from apps.authentication.models import User, UserProfile


class Command(BaseCommand):
    help = "Promotes a user (by email) to superadmin (role='admin', is_staff=True, is_superuser=True)."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True, help="Email address of the target user.")
        parser.add_argument("--create", action="store_true", help="Create the user if not already present.")
        parser.add_argument("--password", default=None, help="Initial password when --create is specified.")
        parser.add_argument("--name", default="Super Admin", help="Display name when creating a new user.")

    def handle(self, *args, **options):
        email = options["email"].strip().lower()
        user = User.objects.filter(email__iexact=email).first()

        if not user:
            if not options["create"]:
                raise CommandError(f"User with email '{email}' not found. Pass --create to create them.")
            username = email.split("@")[0].replace(".", "_")[:30]
            password = options["password"] or None
            user = User.objects.create_superuser(
                email=email,
                username=username,
                password=password,
                name=options["name"],
            )
            self.stdout.write(self.style.SUCCESS(f"Created superadmin: {user.email} (id={user.id})"))
            return

        user.role = "admin"
        user.is_staff = True
        user.is_superuser = True
        user.is_active = True
        user.save(update_fields=["role", "is_staff", "is_superuser", "is_active"])
        UserProfile.objects.get_or_create(user=user, defaults={"display_name": user.name or user.username})
        self.stdout.write(
            self.style.SUCCESS(
                f"Promoted {user.email} (username={user.username}) to superadmin "
                f"[role={user.role}, is_staff={user.is_staff}, is_superuser={user.is_superuser}]"
            )
        )

