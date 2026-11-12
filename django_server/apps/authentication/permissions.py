from rest_framework.permissions import BasePermission

class IsAdminUserRole(BasePermission):
    """Grants strict superadmin access (is_superuser or role='admin' with staff status)."""

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and (
                getattr(user, "is_superuser", False)
                or (getattr(user, "role", "user") == "admin" and getattr(user, "is_staff", False))
            )
        )


class IsRegularUser(BasePermission):
    """
    Grants access to any authenticated user.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

