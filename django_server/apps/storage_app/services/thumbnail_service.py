import os
import logging
from pathlib import Path
from PIL import Image

logger = logging.getLogger(__name__)


def generate_image_thumbnail(source_path: str, thumbnail_dest_dir: Path, max_size=(300, 300)) -> str | None:
    """Generates an optimized JPEG thumbnail from an image file."""
    try:
        if not os.path.exists(source_path):
            return None

        thumbnail_dest_dir.mkdir(parents=True, exist_ok=True)
        base_name = os.path.basename(source_path)
        thumb_name = f"thumb_{os.path.splitext(base_name)[0]}.jpg"
        thumb_full_path = thumbnail_dest_dir / thumb_name

        with Image.open(source_path) as img:
            # Convert RGBA to RGB for JPEG compatibility
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            img.thumbnail(max_size, Image.Resampling.LANCZOS)
            img.save(str(thumb_full_path), "JPEG", quality=80, optimize=True)

        return str(thumb_full_path)
    except Exception as e:
        logger.warning("Could not generate thumbnail for %s: %s", source_path, str(e))
        return None

