from rest_framework.permissions import BasePermission

class IsAdminUserRole(BasePermission):
    """Grants access only to users with role='admin', is_staff, or is_superuser."""

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        return bool(
            user
            and user.is_authenticated
            and (
                getattr(user, "role", "user") == "admin"
                or getattr(user, "is_staff", False)
                or getattr(user, "is_superuser", False)
            )
        )


class IsRegularUser(BasePermission):
    """
    Grants access to any authenticated user.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

