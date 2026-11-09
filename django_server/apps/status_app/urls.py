from django.urls import path
from .views import (
    CreateStatusView,
    StatusFeedView,
    MyStatusView,
    DeleteStatusView,
    RecordStatusView,
    GetStatusViewersView,
    ReactStatusView,
)

urlpatterns = [
    path("", CreateStatusView.as_view(), name="status-create"),
    path("feed", StatusFeedView.as_view(), name="status-feed"),
    path("feed/", StatusFeedView.as_view(), name="status-feed-slash"),
    path("my", MyStatusView.as_view(), name="status-my"),
    path("my/", MyStatusView.as_view(), name="status-my-slash"),
    path("<str:id>", DeleteStatusView.as_view(), name="status-delete"),
    path("<str:id>/", DeleteStatusView.as_view(), name="status-delete-slash"),
    path("<str:id>/view", RecordStatusView.as_view(), name="status-view"),
    path("<str:id>/view/", RecordStatusView.as_view(), name="status-view-slash"),
    path("<str:id>/viewers", GetStatusViewersView.as_view(), name="status-viewers"),
    path("<str:id>/viewers/", GetStatusViewersView.as_view(), name="status-viewers-slash"),
    path("<str:id>/react", ReactStatusView.as_view(), name="status-react"),
    path("<str:id>/react/", ReactStatusView.as_view(), name="status-react-slash"),
]

