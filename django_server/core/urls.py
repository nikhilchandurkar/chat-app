from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse

def root_view(request):
    return JsonResponse("hello its chat app API", safe=False)

def hello_view(request):
    return JsonResponse("hello from nikki", safe=False)

from django.views.static import serve
from django.urls import re_path

urlpatterns = [
    path('', root_view, name='root'),
    path('hello', hello_view, name='hello'),
    path('admin/', admin.site.urls),
    path('api/v1/auth/', include('apps.authentication.urls_auth')),
    path('api/v1/user/', include('apps.authentication.urls')),
    path('api/v1/chat/', include('apps.chat.urls')),
    path('api/v1/message/', include('apps.messages_app.urls')),
    path('api/v1/preview', include('apps.preview.urls')),
    path('api/v1/preview/', include('apps.preview.urls')),
    path('api/v1/admin/', include('apps.authentication.urls_admin')),
    re_path(r'^api/v1/media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
