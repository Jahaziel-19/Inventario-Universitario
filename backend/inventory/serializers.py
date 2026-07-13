from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Category, Brand, Unit, MovementMotive, Location, Product, Movement, SystemConfig, AuditLog


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'is_staff', 'is_superuser']


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = '__all__'


class BrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = '__all__'


class UnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unit
        fields = '__all__'


class MovementMotiveSerializer(serializers.ModelSerializer):
    class Meta:
        model = MovementMotive
        fields = '__all__'


class LocationSerializer(serializers.ModelSerializer):
    full_path = serializers.CharField(source='get_full_path', read_only=True)
    parent_name = serializers.CharField(source='parent.name', read_only=True)

    class Meta:
        model = Location
        fields = ['id', 'name', 'parent', 'parent_name', 'full_path', 'is_active']


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    brand_name = serializers.CharField(source='brand.name', read_only=True)
    unit_name = serializers.CharField(source='unit.abbreviation', read_only=True)
    location_name = serializers.CharField(source='location.get_full_path', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Product
        fields = [
            'id', 'code', 'description', 'category', 'category_name', 
            'brand', 'brand_name', 'unit', 'unit_name', 
            'location', 'location_name', 'min_stock', 'status', 
            'status_display', 'stock', 'observations', 'product_image', 'qr_code', 'barcode'
        ]
        read_only_fields = ['stock', 'qr_code', 'barcode']


class ProductListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    brand_name = serializers.CharField(source='brand.name', read_only=True)
    unit_name = serializers.CharField(source='unit.abbreviation', read_only=True)
    location_name = serializers.CharField(source='location.get_full_path', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Product
        fields = [
            'id', 'code', 'description', 'category', 'category_name',
            'brand', 'brand_name', 'unit', 'unit_name',
            'location', 'location_name', 'min_stock', 'status',
            'status_display', 'stock', 'product_image'
        ]
        read_only_fields = ['stock']


class MovementSerializer(serializers.ModelSerializer):
    product_code = serializers.CharField(source='product.code', read_only=True)
    product_description = serializers.CharField(source='product.description', read_only=True)
    responsible_name = serializers.CharField(source='responsible.username', read_only=True)
    motive_name = serializers.CharField(source='motive.name', read_only=True)
    type_display = serializers.CharField(source='get_type_display', read_only=True)
    custom_motive = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Movement
        fields = [
            'id', 'product', 'product_code', 'product_description',
            'type', 'type_display', 'quantity', 'datetime',
            'responsible', 'responsible_name', 'motive', 'motive_name',
            'custom_motive', 'observations', 'related_document', 'previous_stock', 'result_stock'
        ]
        read_only_fields = ['previous_stock', 'result_stock', 'responsible']
        extra_kwargs = {
            'motive': {'required': False, 'allow_null': True},
        }

    def validate(self, attrs):
        custom_motive = attrs.get('custom_motive', '').strip()
        if not attrs.get('motive') and not custom_motive:
            raise serializers.ValidationError({
                'motive': 'Debe seleccionar un motivo o escribir uno personalizado.'
            })
        return attrs

    def create(self, validated_data):
        custom_motive = validated_data.pop('custom_motive', '').strip()
        if custom_motive and not validated_data.get('motive'):
            motive, _ = MovementMotive.objects.get_or_create(
                name=custom_motive,
                defaults={'description': 'Motivo personalizado registrado desde movimientos.'}
            )
            validated_data['motive'] = motive
        return super().create(validated_data)


class SystemConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemConfig
        fields = '__all__'


class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = AuditLog
        fields = ['id', 'user', 'user_name', 'timestamp', 'action', 'details']
