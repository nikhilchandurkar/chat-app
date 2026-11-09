import os
from pathlib import Path
from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.messages_app.models import Message, MessageAttachment


class Command(BaseCommand):
    help = "Purges expired disappearing messages and cleans up associated files from private storage."

    def handle(self, *args, **options):
        now = timezone.now()
        expired_qs = Message.objects.filter(expires_at__isnull=False, expires_at__lte=now)
        count = expired_qs.count()

        if count == 0:
            self.stdout.write(self.style.SUCCESS("No expired messages found."))
            return

        reclaimed_bytes = 0
        deleted_files = 0

        # Collect attachment file paths
        attachments = MessageAttachment.objects.filter(message__in=expired_qs)
        for att in attachments:
            if att.file_path and os.path.exists(att.file_path):
                try:
                    size = os.path.getsize(att.file_path)
                    os.remove(att.file_path)
                    reclaimed_bytes += size
                    deleted_files += 1
                except Exception as e:
                    self.stderr.write(f"Failed to remove file {att.file_path}: {e}")

            if att.thumbnail_path and os.path.exists(att.thumbnail_path):
                try:
                    os.remove(att.thumbnail_path)
                except Exception:
                    pass

        # Delete database records (cascades to receipts, reactions, edits, attachments)
        deleted_messages, _ = expired_qs.delete()

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully purged {deleted_messages} expired message(s), "
                f"deleted {deleted_files} attachment file(s), "
                f"reclaiming {reclaimed_bytes // 1024} KB of storage."
            )
        )

