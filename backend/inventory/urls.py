from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    UserViewSet, CategoryViewSet, BrandViewSet, UnitViewSet,
    MovementMotiveViewSet, LocationViewSet, ProductViewSet,
    MovementViewSet, SystemConfigViewSet, AuditLogViewSet, DashboardSummaryView
)

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'categories', CategoryViewSet)
router.register(r'brands', BrandViewSet)
router.register(r'units', UnitViewSet)
router.register(r'motives', MovementMotiveViewSet)
router.register(r'locations', LocationViewSet)
router.register(r'products', ProductViewSet)
router.register(r'movements', MovementViewSet)
router.register(r'config', SystemConfigViewSet, basename='config')
router.register(r'audit', AuditLogViewSet)

urlpatterns = [
    path('dashboard/summary/', DashboardSummaryView.as_view(), name='dashboard-summary'),
    path('', include(router.urls)),
]
