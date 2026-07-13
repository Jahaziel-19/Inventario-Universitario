"""
URL configuration for inventario project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
import re

from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.views.static import serve
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/', include('inventory.urls')),
]

if settings.DEBUG or getattr(settings, 'SERVE_STATIC_MEDIA', False):
    media_prefix = re.escape(str(settings.MEDIA_URL).lstrip('/'))
    static_prefix = re.escape(str(settings.STATIC_URL).lstrip('/'))
    urlpatterns += [
        re_path(r'^%s(?P<path>.*)$' % media_prefix, serve, {'document_root': str(settings.MEDIA_ROOT)}),
        re_path(r'^%s(?P<path>.*)$' % static_prefix, serve, {'document_root': str(settings.STATIC_ROOT)}),
    ]

