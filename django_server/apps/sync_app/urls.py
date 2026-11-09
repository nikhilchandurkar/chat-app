from django.urls import path
from .views import SyncDeltaView, SyncAckView

urlpatterns = [
    path("", SyncDeltaView.as_view(), name="sync-delta"),
    path("delta", SyncDeltaView.as_view(), name="sync-delta-named"),
    path("delta/", SyncDeltaView.as_view(), name="sync-delta-named-slash"),
    path("ack", SyncAckView.as_view(), name="sync-ack"),
    path("ack/", SyncAckView.as_view(), name="sync-ack-slash"),
]

