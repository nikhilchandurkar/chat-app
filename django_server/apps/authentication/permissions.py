from rest_framework.permissions import BasePermission

class IsAdminUserRole(BasePermission):
    """
    Grants access only to users with role='admin'.
    """
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            getattr(request.user, "role", "user") == "admin"
        )


class IsRegularUser(BasePermission):
    """
    Grants access to any authenticated user.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

