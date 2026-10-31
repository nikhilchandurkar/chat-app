"""
Custom exception handler that:
  - Returns a consistent JSON error structure
  - Never exposes stack traces or internal details to API clients
  - Logs unexpected server errors internally
"""

import logging
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """
    Wrap DRF errors in:
      {
        "success": false,
        "message": "<human-friendly message>",
        "errors": { ... }     # only for validation errors
      }
    """
    response = exception_handler(exc, context)

    if response is not None:
        # DRF handled it – normalise the shape
        data = response.data

        if isinstance(data, dict):
            # Extract a top-level 'detail' string when present
            detail = data.get("detail")
            message = str(detail) if detail else _http_status_message(response.status_code)
            errors = {k: v for k, v in data.items() if k != "detail"} or None
        elif isinstance(data, list):
            message = _http_status_message(response.status_code)
            errors = {"non_field_errors": data}
        else:
            message = str(data)
            errors = None

        body = {"success": False, "message": message}
        if errors:
            body["errors"] = errors

        response.data = body
        return response

    # DRF did NOT handle it – unexpected server error
    logger.exception(
        "Unhandled exception in %s",
        context.get("view", "unknown view"),
        exc_info=exc,
    )
    return Response(
        {"success": False, "message": "An unexpected error occurred. Please try again."},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


def _http_status_message(code: int) -> str:
    messages = {
        400: "Bad request.",
        401: "Authentication required.",
        403: "You do not have permission to perform this action.",
        404: "The requested resource was not found.",
        405: "Method not allowed.",
        429: "Too many requests. Please slow down.",
        500: "Internal server error.",
    }
    return messages.get(code, f"HTTP {code}")
