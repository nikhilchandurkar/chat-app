import os
import re
import zipfile

DANGEROUS_EXTENSIONS = {
    ".exe", ".bat", ".cmd", ".sh", ".bash", ".php", ".py", ".pl", ".cgi",
    ".js", ".vbs", ".scr", ".pif", ".msi", ".dll", ".so", ".bin", ".jsp",
    ".asp", ".aspx", ".htaccess", ".html", ".htm", ".xhtml"
}

ALLOWED_EXTENSIONS = {
    # Images
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".heic", ".heif", ".avif",
    # Documents
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".rtf",
    # Audio
    ".mp3", ".wav", ".ogg", ".m4a", ".aac", ".webm",
    # Video
    ".mp4", ".mov", ".avi", ".mkv",
    # Archives
    ".zip", ".tar", ".gz", ".7z"
}

# Binary headers that indicate executable/malicious binaries regardless of extension
DANGEROUS_MAGIC_HEADERS = [
    (b"MZ", "Windows PE Executable"),
    (b"\x7fELF", "Linux ELF Executable"),
    (b"\xca\xfe\xba\xbe", "Java Class Executable"),
    (b"<?php", "PHP Script"),
    (b"#!/", "Shell Script"),
    (b"<script", "Inline JavaScript"),
]


def sanitize_filename(filename: str) -> str:
    """Strips path traversal attempts, null bytes, and malicious directory separators."""
    if not filename:
        return "attachment"
    # Remove null bytes
    filename = filename.replace("\0", "")
    # Normalize separators
    filename = filename.replace("\\", "/")
    base = os.path.basename(filename)
    clean = re.sub(r"[^\w\s\.-]", "_", base)
    clean = clean.replace("..", "_")
    return clean.strip("._ ") or "attachment"


def validate_file_header(header_bytes: bytes, file_name: str) -> tuple[bool, str]:
    ext = os.path.splitext(file_name.lower())[1]

    # 1. Extension Deny-list
    if ext in DANGEROUS_EXTENSIONS:
        return False, f"File type '{ext}' is prohibited for security reasons."

    # 2. Extension Allow-list
    if ext and ext not in ALLOWED_EXTENSIONS:
        return False, f"Unsupported file extension '{ext}'."

    # 3. Detect Executable Signatures regardless of extension
    for magic, desc in DANGEROUS_MAGIC_HEADERS:
        if header_bytes.startswith(magic):
            return False, f"Disallowed file format detected: {desc}."

    # 4. Strict Magic Signature Verification for common types
    if ext in (".jpg", ".jpeg") and not header_bytes.startswith(b"\xFF\xD8\xFF"):
        return False, "Corrupted image file header (not a valid JPEG)."
    if ext == ".png" and not header_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return False, "Corrupted image file header (not a valid PNG)."
    if ext == ".gif" and not (header_bytes.startswith(b"GIF87a") or header_bytes.startswith(b"GIF89a")):
        return False, "Corrupted image file header (not a valid GIF)."
    if ext == ".pdf" and not header_bytes.startswith(b"%PDF-"):
        return False, "Corrupted PDF file header."

    return True, "Valid"


def inspect_archive_safety(file_path: str, max_uncompressed_bytes: int = 200 * 1024 * 1024, max_ratio: float = 50.0) -> tuple[bool, str]:
    """Detects ZIP bombs and recursive archives."""
    if not zipfile.is_zipfile(file_path):
        return True, "Not a zip archive"

    try:
        with zipfile.ZipFile(file_path, "r") as zf:
            total_uncompressed = 0
            total_compressed = 0
            for info in zf.infolist():
                # Path traversal check in zip member
                if ".." in info.filename or info.filename.startswith(("/", "\\")):
                    return False, "Archive contains malicious path traversal entry."

                # Disallow nested zip/tar/exe inside archives
                sub_ext = os.path.splitext(info.filename.lower())[1]
                if sub_ext in DANGEROUS_EXTENSIONS or sub_ext in (".zip", ".tar", ".gz", ".7z"):
                    return False, f"Archive contains prohibited file type: '{sub_ext}'."

                total_uncompressed += info.file_size
                total_compressed += info.compress_size

                if total_uncompressed > max_uncompressed_bytes:
                    return False, "Archive exceeds uncompressed size safety threshold (ZIP bomb suspected)."

            if total_compressed > 0 and (total_uncompressed / total_compressed) > max_ratio:
                return False, "Abnormal archive compression ratio detected (ZIP bomb suspected)."

        return True, "Safe archive"
    except Exception as e:
        return False, f"Failed to inspect archive: {str(e)}"
