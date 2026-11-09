import os
from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.status_app.models import UserStatus


class Command(BaseCommand):
    help = "Purges user status stories older than 24 hours and cleans up attached media files."

    def handle(self, *args, **options):
        now = timezone.now()
        expired_qs = UserStatus.objects.filter(expires_at__lte=now)
        count = expired_qs.count()

        if count == 0:
            self.stdout.write(self.style.SUCCESS("No expired status stories found."))
            return

        reclaimed_bytes = 0
        deleted_files = 0

        for status_item in expired_qs:
            if status_item.media_path and os.path.exists(status_item.media_path):
                try:
                    size = os.path.getsize(status_item.media_path)
                    os.remove(status_item.media_path)
                    reclaimed_bytes += size
                    deleted_files += 1
                except Exception as e:
                    self.stderr.write(f"Failed to delete status media file {status_item.media_path}: {e}")

        deleted_count, _ = expired_qs.delete()
        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully purged {deleted_count} expired status(es) and {deleted_files} media file(s), "
                f"reclaiming {reclaimed_bytes // 1024} KB."
            )
        )

