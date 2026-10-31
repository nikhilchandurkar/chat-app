from django.urls import re_path
from .consumers import ChatConsumer

websocket_urlpatterns = [
    # Primary WebSocket endpoint – used by the React frontend and mobile clients
    re_path(r"^ws/?$", ChatConsumer.as_asgi()),
    re_path(r"^ws/chat/?$", ChatConsumer.as_asgi()),
]
