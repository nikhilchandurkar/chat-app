import logging
import os
import re
from pathlib import Path
from PIL import Image
from django.conf import settings

logger = logging.getLogger(__name__)


def _safe_log_value(val) -> str:
    return re.sub(r"[\r\n]+", " ", str(val))[:200]


def generate_image_thumbnail(source_path: str, thumbnail_dest_dir: Path, max_size=(300, 300)) -> str | None:
    """Generates an optimized JPEG thumbnail from an image file strictly inside STORAGE_ROOT."""
    try:
        storage_root = Path(settings.STORAGE_ROOT).resolve()
        src_resolved = Path(source_path).resolve()
        dest_dir_resolved = Path(thumbnail_dest_dir).resolve()

        if not src_resolved.is_relative_to(storage_root) or not dest_dir_resolved.is_relative_to(storage_root):
            logger.warning("Blocked thumbnail generation outside storage root.")
            return None

        if not src_resolved.exists():
            return None

        dest_dir_resolved.mkdir(parents=True, exist_ok=True)
        base_name = os.path.basename(str(src_resolved))
        thumb_name = f"thumb_{os.path.splitext(base_name)[0]}.jpg"
        thumb_full_path = (dest_dir_resolved / thumb_name).resolve()

        if not thumb_full_path.is_relative_to(dest_dir_resolved):
            return None

        with Image.open(src_resolved) as img:
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            img.thumbnail(max_size, Image.Resampling.LANCZOS)
            img.save(str(thumb_full_path), "JPEG", quality=80, optimize=True)

        return str(thumb_full_path)
    except Exception as e:
        logger.warning("Could not generate thumbnail (%s)", _safe_log_value(e))
        return None
