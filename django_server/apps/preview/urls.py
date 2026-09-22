from django.urls import path
from .views import PreviewLinkView

urlpatterns = [
    path('', PreviewLinkView.as_view(), name='preview-link'),
]

