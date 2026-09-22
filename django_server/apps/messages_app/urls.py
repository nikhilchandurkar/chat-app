from django.urls import path
from .views import (
    SearchMessagesView,
    EditMessageView,
    ReactMessageView,
    ForwardMessageView,
    GetMediaView,
)

urlpatterns = [
    path('search/<str:chat_id>', SearchMessagesView.as_view(), name='message-search'),
    path('react/<str:id>', ReactMessageView.as_view(), name='message-react'),
    path('forward', ForwardMessageView.as_view(), name='message-forward'),
    path('media/<str:chat_id>', GetMediaView.as_view(), name='message-media'),
    path('<str:id>', EditMessageView.as_view(), name='message-edit-delete'),
]

