"""Custom password hasher tuning for high-concurrency low-vCPU environments."""

from django.contrib.auth.hashers import BCryptSHA256PasswordHasher


class FastBCryptSHA256PasswordHasher(BCryptSHA256PasswordHasher):
    """OWASP-compliant bcrypt-sha256 at cost factor 10 (~72ms vs ~539ms PBKDF2-1M)."""

    rounds = 10

