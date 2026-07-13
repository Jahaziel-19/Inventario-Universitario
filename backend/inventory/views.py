import csv
import difflib
import io
import json
import re
import unicodedata
import pandas as pd
from openpyxl import Workbook
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.db.models import Q, F, Sum
from django.http import HttpResponse
from django.utils import timezone

from .models import (
    Category, Brand, Unit, MovementMotive, Location, Product, Movement, SystemConfig, AuditLog
)
from .serializers import (
    UserSerializer, CategorySerializer, BrandSerializer, UnitSerializer,
    MovementMotiveSerializer, LocationSerializer, ProductSerializer, ProductListSerializer,
    MovementSerializer, SystemConfigSerializer, AuditLogSerializer
)


IMPORT_FIELD_CONFIG = [
    {"field": "codigo", "label": "Codigo", "required": True},
    {"field": "descripcion", "label": "Descripcion", "required": True},
    {"field": "categoria", "label": "Categoria", "required": True},
    {"field": "marca", "label": "Marca", "required": True},
    {"field": "unidad", "label": "Unidad", "required": True},
    {"field": "ubicacion", "label": "Ubicacion", "required": True},
    {"field": "existencia", "label": "Existencia Inicial", "required": False},
    {"field": "stock_minimo", "label": "Stock Minimo", "required": False},
    {"field": "estado", "label": "Estado", "required": False},
    {"field": "observaciones", "label": "Observaciones", "required": False},
]

IMPORT_FIELD_ALIASES = {
    "codigo": ["codigo", "codigo_interno", "clave", "sku"],
    "descripcion": ["descripcion", "descripcion_producto", "producto", "articulo", "nombre"],
    "categoria": ["categoria", "tipo", "clasificacion"],
    "marca": ["marca", "fabricante"],
    "unidad": ["unidad", "unidad_medida", "unidad_abreviada", "uom"],
    "ubicacion": ["ubicacion", "ubicacion_fisica", "almacen", "localizacion"],
    "existencia": ["existencia", "existencias", "stock", "stock_actual", "cantidad"],
    "stock_minimo": ["stock_minimo", "minimo", "stock_min", "min_stock"],
    "estado": ["estado", "estatus"],
    "observaciones": ["observaciones", "notas", "comentarios"],
}


def normalize_import_key(value):
    text = str(value or "").strip().lower()
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def parse_import_string(value):
    if value is None or pd.isna(value):
        return ""
    return str(value).strip()


def parse_import_bool(value):
    return str(value).lower() in {"true", "1", "yes", "si", "on"}


def clamp_import_row(value, default, minimum, maximum):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(parsed, maximum))


def unique_headers(header_values):
    seen = {}
    headers = []
    for index, value in enumerate(header_values):
        base = parse_import_string(value) or f"columna_{index + 1}"
        current = base
        suffix = 2
        while current.lower() in seen:
            current = f"{base}_{suffix}"
            suffix += 1
        seen[current.lower()] = True
        headers.append(current)
    return headers


def get_import_source(file_obj, sheet_name=None):
    file_name = (file_obj.name or "").lower()
    if file_name.endswith(".csv"):
        raw = file_obj.read().decode("utf-8-sig")
        dataframe = pd.read_csv(io.StringIO(raw), header=None, dtype=object, keep_default_na=False)
        return dataframe.fillna(""), ["CSV"], "CSV"

    workbook = pd.ExcelFile(file_obj)
    sheet_names = workbook.sheet_names
    selected_sheet = sheet_name if sheet_name in sheet_names else sheet_names[0]
    dataframe = pd.read_excel(
        workbook,
        sheet_name=selected_sheet,
        header=None,
        dtype=object,
        keep_default_na=False,
    )
    return dataframe.fillna(""), sheet_names, selected_sheet


def get_import_dataset(raw_df, header_row=1, data_start_row=None, data_end_row=None):
    total_rows = max(int(raw_df.shape[0]), 1)
    header_row = clamp_import_row(header_row, 1, 1, total_rows)
    suggested_start = header_row + 1 if header_row < total_rows else header_row
    data_start_row = clamp_import_row(data_start_row, suggested_start, header_row, total_rows)
    data_end_row = clamp_import_row(data_end_row, total_rows, data_start_row, total_rows)

    headers = unique_headers(raw_df.iloc[header_row - 1].tolist())
    dataset = raw_df.iloc[data_start_row - 1:data_end_row].copy()
    dataset.columns = headers
    dataset = dataset.reset_index(drop=True)

    return {
        "headers": headers,
        "dataset": dataset,
        "header_row": header_row,
        "data_start_row": data_start_row,
        "data_end_row": data_end_row,
        "total_rows": total_rows,
    }


def suggest_import_mapping(headers):
    suggestions = {}
    normalized_headers = {header: normalize_import_key(header) for header in headers}

    for config in IMPORT_FIELD_CONFIG:
        field = config["field"]
        aliases = {normalize_import_key(alias) for alias in IMPORT_FIELD_ALIASES.get(field, []) + [field]}
        exact_match = next((header for header, normalized in normalized_headers.items() if normalized in aliases), None)
        if exact_match:
            suggestions[field] = exact_match
            continue

        partial_match = next(
            (
                header
                for header, normalized in normalized_headers.items()
                if any(alias in normalized or normalized in alias for alias in aliases)
            ),
            "",
        )
        suggestions[field] = partial_match

    return suggestions


def get_import_mapping(headers, raw_mapping):
    if isinstance(raw_mapping, str):
        try:
            parsed_mapping = json.loads(raw_mapping) if raw_mapping else {}
        except json.JSONDecodeError:
            parsed_mapping = {}
    else:
        parsed_mapping = raw_mapping or {}

    header_lookup = {str(header): str(header) for header in headers}
    mapping = {}
    for config in IMPORT_FIELD_CONFIG:
        field = config["field"]
        value = parse_import_string(parsed_mapping.get(field))
        mapping[field] = header_lookup.get(value, "")

    if not any(mapping.values()):
        mapping = suggest_import_mapping(headers)

    return mapping


def build_preview_rows(dataset, headers, mapping, limit=8):
    raw_rows = []
    mapped_rows = []

    for offset, (_, row) in enumerate(dataset.head(limit).iterrows(), start=1):
        raw_item = {"__fila": offset}
        for header in headers:
            raw_item[header] = parse_import_string(row.get(header, ""))
        raw_rows.append(raw_item)

        mapped_item = {"__fila": offset}
        for config in IMPORT_FIELD_CONFIG:
            source_header = mapping.get(config["field"])
            mapped_item[config["field"]] = parse_import_string(row.get(source_header, "")) if source_header else ""
        mapped_rows.append(mapped_item)

    return raw_rows, mapped_rows


def parse_import_status(value):
    normalized = normalize_import_key(value)
    if not normalized:
        return "ACT"
    status_map = {
        "activo": "ACT",
        "act": "ACT",
        "inactivo": "INA",
        "ina": "INA",
        "obsoleto": "OBS",
        "obs": "OBS",
    }
    if normalized in status_map:
        return status_map[normalized]
    raise ValueError("Estado invalido")


def parse_import_integer(value, field_name, default=0):
    text = parse_import_string(value)
    if not text:
        return default
    try:
        return int(float(text))
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} invalida")


def get_location_path_parts(path_value):
    path_value = parse_import_string(path_value)
    if not path_value:
        return []

    normalized_path = path_value
    for separator in ["➔", "->", ">", ","]:
        normalized_path = normalized_path.replace(separator, "|")

    return [part.strip() for part in normalized_path.split("|") if part.strip()]


def get_location_lookup_keys(path_value):
    parts = get_location_path_parts(path_value)
    if not parts:
        return []

    joined_arrow = " ➔ ".join(parts)
    joined_comma = ",".join(parts)
    joined_plain = "".join(parts)

    keys = {
        parse_import_string(path_value).lower(),
        joined_arrow.lower(),
        joined_comma.lower(),
        joined_plain.lower(),
        parts[-1].lower(),
    }
    return [key for key in keys if key]


def get_or_create_location_from_path(path_value):
    path_value = parse_import_string(path_value)
    if not path_value:
        raise ValueError("Ubicacion vacia")
    parts = get_location_path_parts(path_value)
    parent = None
    current = None
    for part in parts:
        current, _ = Location.objects.get_or_create(name=part, parent=parent)
        parent = current
    return current


def register_location_lookup(location_lookup, location):
    for key in get_location_lookup_keys(location.get_full_path()):
        location_lookup[key] = location
    for key in get_location_lookup_keys(location.name):
        location_lookup[key] = location


def build_import_catalog_lookups():
    categories_dict = {c.name.lower(): c for c in Category.objects.all()}
    brands_dict = {b.name.lower(): b for b in Brand.objects.all()}
    units_dict = {u.abbreviation.lower(): u for u in Unit.objects.all()}
    units_dict.update({u.name.lower(): u for u in Unit.objects.all()})
    locations_dict = {}
    for location in Location.objects.all():
        register_location_lookup(locations_dict, location)

    return {
        "categories": categories_dict,
        "brands": brands_dict,
        "units": units_dict,
        "locations": locations_dict,
    }


def validate_import_rows(
    dataset_info,
    mapping,
    *,
    create_categories=False,
    create_brands=False,
    create_units=False,
    create_locations=False,
    overwrite_existing=False,
):
    default_min_stock = SystemConfig.get_config().default_min_stock
    lookups = build_import_catalog_lookups()
    row_analysis = []
    suggestions = {}

    def parse_min_stock(value):
        if value is None or pd.isna(value) or str(value).strip() == '':
            return default_min_stock
        try:
            return max(0, int(float(value)))
        except (TypeError, ValueError):
            raise ValueError("Stock mínimo inválido")

    for index, row in dataset_info["dataset"].iterrows():
        row_num = dataset_info["data_start_row"] + index
        issues = []
        warnings = []

        code = parse_import_string(row.get(mapping.get("codigo", "")))
        description = parse_import_string(row.get(mapping.get("descripcion", "")))
        category_name = parse_import_string(row.get(mapping.get("categoria", "")))
        brand_name = parse_import_string(row.get(mapping.get("marca", "")))
        unit_name = parse_import_string(row.get(mapping.get("unidad", "")))
        location_name = parse_import_string(row.get(mapping.get("ubicacion", "")))
        observations_value = parse_import_string(row.get(mapping.get("observaciones", "")))

        try:
            min_stock = parse_min_stock(row.get(mapping.get("stock_minimo", ""), default_min_stock))
            initial_stock = max(0, parse_import_integer(row.get(mapping.get("existencia", ""), 0), "Existencia", default=0))
            product_status = parse_import_status(row.get(mapping.get("estado", ""), ""))
        except ValueError:
            issues.append("Hay un valor inválido en stock mínimo, existencias o estado.")
            min_stock = default_min_stock
            initial_stock = 0
            product_status = "ACT"

        if not code:
            issues.append("El código está vacío.")
        if not description:
            issues.append("La descripción está vacía.")

        if category_name:
            if category_name.lower() not in lookups["categories"]:
                if create_categories:
                    warnings.append(f"Se creará la categoría '{category_name}'.")
                else:
                    sugg = difflib.get_close_matches(category_name, list(lookups["categories"].keys()), n=1, cutoff=0.5)
                    if sugg:
                        suggestions[category_name] = lookups["categories"][sugg[0]].name
                    issues.append(f"La categoría '{category_name}' no existe.")
        else:
            issues.append("La categoría está vacía.")

        if brand_name:
            if brand_name.lower() not in lookups["brands"]:
                if create_brands:
                    warnings.append(f"Se creará la marca '{brand_name}'.")
                else:
                    sugg = difflib.get_close_matches(brand_name, list(lookups["brands"].keys()), n=1, cutoff=0.5)
                    if sugg:
                        suggestions[brand_name] = lookups["brands"][sugg[0]].name
                    issues.append(f"La marca '{brand_name}' no existe.")
        else:
            issues.append("La marca está vacía.")

        if unit_name:
            if unit_name.lower() not in lookups["units"]:
                if create_units:
                    warnings.append(f"Se creará la unidad '{unit_name}'.")
                else:
                    sugg = difflib.get_close_matches(unit_name, list(lookups["units"].keys()), n=1, cutoff=0.5)
                    if sugg:
                        suggestions[unit_name] = lookups["units"][sugg[0]].abbreviation
                    issues.append(f"La unidad '{unit_name}' no existe.")
        else:
            issues.append("La unidad está vacía.")

        if location_name:
            location_exists = any(key in lookups["locations"] for key in get_location_lookup_keys(location_name))
            if not location_exists:
                if create_locations:
                    warnings.append(f"Se creará la ubicación '{location_name}'.")
                else:
                    sugg = difflib.get_close_matches(location_name, list(lookups["locations"].keys()), n=1, cutoff=0.5)
                    if sugg:
                        suggestions[location_name] = lookups["locations"][sugg[0]].name
                    issues.append(f"La ubicación '{location_name}' no existe.")
        else:
            issues.append("La ubicación está vacía.")

        existing_product = Product.objects.filter(code=code).first() if code else None
        if existing_product:
            if overwrite_existing:
                warnings.append(f"El producto '{code}' ya existe y será sobrescrito.")
            else:
                issues.append(f"El producto con código '{code}' ya está registrado.")

        status_key = "invalid" if issues else "warning" if warnings else "valid"
        row_analysis.append({
            "row_number": row_num,
            "code": code,
            "description": description,
            "category": category_name,
            "brand": brand_name,
            "unit": unit_name,
            "location": location_name,
            "existencia": initial_stock,
            "stock_minimo": min_stock,
            "estado": product_status,
            "observaciones": observations_value,
            "issues": issues,
            "warnings": warnings,
            "status": status_key,
            "can_import": not issues,
            "exists": bool(existing_product),
        })

    summary = {
        "total_rows": len(row_analysis),
        "valid_rows": len([row for row in row_analysis if row["status"] == "valid"]),
        "warning_rows": len([row for row in row_analysis if row["status"] == "warning"]),
        "invalid_rows": len([row for row in row_analysis if row["status"] == "invalid"]),
    }
    return row_analysis, summary, suggestions


def resolve_catalog_for_import(name, lookup, model_class, *, create_enabled=False, abbreviation=False):
    normalized = name.lower()
    instance = lookup.get(normalized)
    if instance:
        return instance

    if not create_enabled:
        return None

    if model_class is Unit:
        instance = Unit.objects.create(name=name, abbreviation=name[:10] or "UND")
        lookup[instance.name.lower()] = instance
        lookup[instance.abbreviation.lower()] = instance
        return instance

    instance = model_class.objects.create(name=name)
    lookup[name.lower()] = instance
    return instance


def resolve_location_for_import(name, lookup, *, create_enabled=False):
    instance = None
    for key in get_location_lookup_keys(name):
        instance = lookup.get(key)
        if instance:
            break
    if instance:
        return instance
    if not create_enabled:
        return None
    instance = get_or_create_location_from_path(name)
    register_location_lookup(lookup, instance)
    return instance


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer

    def get_permissions(self):
        if self.action == 'create':
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    @action(detail=False, methods=['get'])
    def me(self, request):
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def change_password(self, request):
        user = request.user
        current_password = request.data.get('current_password', '')
        new_password = request.data.get('new_password', '')
        confirm_password = request.data.get('confirm_password', '')

        if not current_password or not new_password or not confirm_password:
            return Response(
                {"error": "Debe completar todos los campos de contraseña."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not user.check_password(current_password):
            return Response(
                {"error": "La contraseña actual es incorrecta."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if new_password != confirm_password:
            return Response(
                {"error": "La nueva contraseña y la confirmación no coinciden."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_password(new_password, user=user)
        except Exception as exc:
            messages = getattr(exc, "messages", None) or [str(exc)]
            return Response({"error": " ".join(messages)}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save(update_fields=['password'])

        AuditLog.objects.create(
            user=user,
            action="CHANGE_PASSWORD",
            details="El usuario actualizó su contraseña desde la interfaz.",
        )

        return Response({"message": "Contraseña actualizada correctamente."})

    def create(self, request, *args, **kwargs):
        # Action for registering users (signup)
        data = request.data
        username = data.get('username')
        password = data.get('password')
        email = data.get('email', '')
        first_name = data.get('first_name', '')
        last_name = data.get('last_name', '')

        if not username or not password:
            return Response(
                {"error": "Username and password are required"},
                status=status.HTTP_400_BAD_RECORD
            )

        if User.objects.filter(username=username).exists():
            return Response(
                {"error": "El nombre de usuario ya existe"},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = User.objects.create_user(
            username=username,
            password=password,
            email=email,
            first_name=first_name,
            last_name=last_name
        )
        serializer = self.get_serializer(user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ProductPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


class MovementPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


class AuditPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


class OptionalCatalogPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100

    def paginate_queryset(self, queryset, request, view=None):
        if 'page' not in request.query_params and 'page_size' not in request.query_params:
            return None
        return super().paginate_queryset(queryset, request, view)


def apply_catalog_queryset(queryset, request, *, search_fields, ordering_fields=None, default_order='name'):
    search = (request.query_params.get('search') or '').strip()
    if search:
        search_query = Q()
        for field in search_fields:
            search_query |= Q(**{f'{field}__icontains': search})
        queryset = queryset.filter(search_query)

    ordering_fields = ordering_fields or {'name': 'name', 'is_active': 'is_active'}
    ordering = (request.query_params.get('ordering') or default_order).strip()
    if ordering:
        ordering_key = ordering.lstrip('-')
        if ordering_key in ordering_fields:
            prefix = '-' if ordering.startswith('-') else ''
            queryset = queryset.order_by(f'{prefix}{ordering_fields[ordering_key]}')
        else:
            queryset = queryset.order_by(default_order)

    return queryset


class DashboardSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        products = Product.objects.all()
        movements_today = Movement.objects.filter(datetime__date=today)

        entries_today = movements_today.filter(type__in=['ENT', 'AJP']).aggregate(total=Sum('quantity'))['total'] or 0
        exits_today = movements_today.filter(type__in=['SAL', 'AJN']).aggregate(total=Sum('quantity'))['total'] or 0

        low_stock = products.filter(stock__gt=0, stock__lte=F('min_stock')).count()
        out_of_stock = products.filter(stock=0).count()

        recent_movements = Movement.objects.select_related(
            'product', 'motive', 'responsible'
        ).order_by('-datetime')[:5]
        recent_audits = AuditLog.objects.select_related('user').order_by('-timestamp')[:5]

        return Response({
            'stats': {
                'totalProducts': products.count(),
                'totalCategories': Category.objects.count(),
                'entriesToday': entries_today,
                'exitsToday': exits_today,
                'lowStock': low_stock,
                'outOfStock': out_of_stock,
            },
            'recentMovements': MovementSerializer(recent_movements, many=True).data,
            'recentAudits': AuditLogSerializer(recent_audits, many=True).data,
        })


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ['is_active']
    pagination_class = OptionalCatalogPagination

    def get_queryset(self):
        queryset = Category.objects.all()
        return apply_catalog_queryset(
            queryset,
            self.request,
            search_fields=['name', 'description'],
            ordering_fields={'name': 'name', 'description': 'description', 'is_active': 'is_active'},
        )


class BrandViewSet(viewsets.ModelViewSet):
    queryset = Brand.objects.all()
    serializer_class = BrandSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ['is_active']
    pagination_class = OptionalCatalogPagination

    def get_queryset(self):
        queryset = Brand.objects.all()
        return apply_catalog_queryset(
            queryset,
            self.request,
            search_fields=['name'],
        )


class UnitViewSet(viewsets.ModelViewSet):
    queryset = Unit.objects.all()
    serializer_class = UnitSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ['is_active']
    pagination_class = OptionalCatalogPagination

    def get_queryset(self):
        queryset = Unit.objects.all()
        return apply_catalog_queryset(
            queryset,
            self.request,
            search_fields=['name', 'abbreviation'],
            ordering_fields={'name': 'name', 'abbreviation': 'abbreviation', 'is_active': 'is_active'},
        )


class MovementMotiveViewSet(viewsets.ModelViewSet):
    queryset = MovementMotive.objects.all()
    serializer_class = MovementMotiveSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ['is_active']
    pagination_class = OptionalCatalogPagination

    def get_queryset(self):
        queryset = MovementMotive.objects.all()
        return apply_catalog_queryset(
            queryset,
            self.request,
            search_fields=['name', 'description'],
            ordering_fields={'name': 'name', 'description': 'description', 'is_active': 'is_active'},
            default_order='name',
        )


class LocationViewSet(viewsets.ModelViewSet):
    queryset = Location.objects.all()
    serializer_class = LocationSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ['is_active']
    pagination_class = OptionalCatalogPagination

    def get_queryset(self):
        queryset = Location.objects.select_related('parent').all()
        return apply_catalog_queryset(
            queryset,
            self.request,
            search_fields=['name', 'parent__name'],
            ordering_fields={'name': 'name', 'parent_name': 'parent__name', 'is_active': 'is_active'},
        )


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = ProductPagination

    def get_serializer_class(self):
        if self.action == 'list':
            return ProductListSerializer
        return ProductSerializer

    def get_queryset(self):
        queryset = Product.objects.select_related('category', 'brand', 'unit', 'location').order_by('code')
        
        # Búsqueda global (código, descripción, marca, categoría, ubicación)
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                Q(code__icontains=search) |
                Q(description__icontains=search) |
                Q(brand__name__icontains=search) |
                Q(category__name__icontains=search) |
                Q(location__name__icontains=search)
            )

        # Filtros específicos
        category = self.request.query_params.get('category', None)
        if category:
            queryset = queryset.filter(category_id=category)

        brand = self.request.query_params.get('brand', None)
        if brand:
            queryset = queryset.filter(brand_id=brand)

        unit = self.request.query_params.get('unit', None)
        if unit:
            queryset = queryset.filter(unit_id=unit)

        location = self.request.query_params.get('location', None)
        if location:
            # We also get child locations if needed, but for simplicity, exact location:
            queryset = queryset.filter(location_id=location)

        status_param = self.request.query_params.get('status', None)
        if status_param:
            queryset = queryset.filter(status=status_param)

        min_stock = self.request.query_params.get('low_stock', None)
        if min_stock == 'true':
            queryset = queryset.filter(stock__lte=F('min_stock'))

        out_of_stock = self.request.query_params.get('out_of_stock', None)
        if out_of_stock == 'true':
            queryset = queryset.filter(stock=0)

        return queryset

    @action(detail=True, methods=['get'])
    def kardex(self, request, pk=None):
        product = self.get_object()
        movements = product.movements.all().order_by('-datetime')
        serializer = MovementSerializer(movements, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='qr-code')
    def qr_code(self, request, pk=None):
        product = self.get_object()
        response = HttpResponse(product.generate_qr_image(), content_type='image/png')
        response['Content-Disposition'] = f'inline; filename="qr_{product.code}.png"'
        return response

    @action(detail=True, methods=['get'], url_path='barcode-image')
    def barcode_image(self, request, pk=None):
        product = self.get_object()
        response = HttpResponse(product.generate_barcode_image(), content_type='image/png')
        response['Content-Disposition'] = f'inline; filename="barcode_{product.code}.png"'
        return response

    @action(detail=False, methods=['post'])
    def import_preview(self, request):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({"error": "No se subio ningun archivo."}, status=status.HTTP_400_BAD_REQUEST)

        sheet_name = request.data.get('sheet_name')
        header_row = request.data.get('header_row', 1)
        data_start_row = request.data.get('data_start_row')
        data_end_row = request.data.get('data_end_row')
        requested_mapping = request.data.get('mapping', '{}')
        create_categories = parse_import_bool(request.data.get('create_categories'))
        create_brands = parse_import_bool(request.data.get('create_brands'))
        create_units = parse_import_bool(request.data.get('create_units'))
        create_locations = parse_import_bool(request.data.get('create_locations'))
        overwrite_existing = parse_import_bool(request.data.get('overwrite_existing'))

        try:
            raw_df, sheet_names, selected_sheet = get_import_source(file_obj, sheet_name=sheet_name)
            dataset_info = get_import_dataset(
                raw_df,
                header_row=header_row,
                data_start_row=data_start_row,
                data_end_row=data_end_row,
            )
            mapping = get_import_mapping(dataset_info["headers"], requested_mapping)
            raw_preview, mapped_preview = build_preview_rows(
                dataset_info["dataset"],
                dataset_info["headers"],
                mapping,
            )
            row_analysis, summary, suggestions = validate_import_rows(
                dataset_info,
                mapping,
                create_categories=create_categories,
                create_brands=create_brands,
                create_units=create_units,
                create_locations=create_locations,
                overwrite_existing=overwrite_existing,
            )
        except Exception as exc:
            return Response({"error": f"Error al analizar el archivo: {str(exc)}"}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "sheet_names": sheet_names,
            "selected_sheet": selected_sheet,
            "total_rows": dataset_info["total_rows"],
            "header_row": dataset_info["header_row"],
            "data_start_row": dataset_info["data_start_row"],
            "data_end_row": dataset_info["data_end_row"],
            "headers": dataset_info["headers"],
            "field_config": IMPORT_FIELD_CONFIG,
            "mapping": mapping,
            "preview_rows": raw_preview,
            "mapped_preview_rows": mapped_preview,
            "row_analysis": row_analysis[:25],
            "summary": summary,
            "suggestions": suggestions,
        })

    @action(detail=False, methods=['post'])
    @transaction.atomic
    def import_excel(self, request):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({"error": "No se subió ningún archivo."}, status=status.HTTP_400_BAD_REQUEST)

        create_categories = parse_import_bool(request.data.get('create_categories'))
        create_brands = parse_import_bool(request.data.get('create_brands'))
        create_units = parse_import_bool(request.data.get('create_units'))
        create_locations = parse_import_bool(request.data.get('create_locations'))
        skip_invalid_rows = parse_import_bool(request.data.get('skip_invalid_rows'))
        overwrite_existing = parse_import_bool(request.data.get('overwrite_existing'))
        sheet_name = request.data.get('sheet_name')
        header_row = request.data.get('header_row', 1)
        data_start_row = request.data.get('data_start_row')
        data_end_row = request.data.get('data_end_row')
        requested_mapping = request.data.get('mapping', '{}')

        try:
            raw_df, _, _ = get_import_source(file_obj, sheet_name=sheet_name)
            dataset_info = get_import_dataset(
                raw_df,
                header_row=header_row,
                data_start_row=data_start_row,
                data_end_row=data_end_row,
            )
            mapping = get_import_mapping(dataset_info["headers"], requested_mapping)
        except Exception as exc:
            return Response({"error": f"Error al leer el archivo: {str(exc)}"}, status=status.HTTP_400_BAD_REQUEST)

        required_fields = [field["field"] for field in IMPORT_FIELD_CONFIG if field["required"]]
        missing_mapping = [field for field in required_fields if not mapping.get(field)]
        if missing_mapping:
            return Response({
                "error": f"Falta mapear columnas requeridas: {', '.join(missing_mapping)}",
                "mapping": mapping,
                "headers": dataset_info["headers"],
            }, status=status.HTTP_400_BAD_REQUEST)

        row_analysis, summary, suggestions = validate_import_rows(
            dataset_info,
            mapping,
            create_categories=create_categories,
            create_brands=create_brands,
            create_units=create_units,
            create_locations=create_locations,
            overwrite_existing=overwrite_existing,
        )

        invalid_rows = [row for row in row_analysis if row["status"] == "invalid"]
        if invalid_rows and not skip_invalid_rows:
            transaction.set_rollback(True)
            return Response({
                "errors": [f"Fila {row['row_number']}: {' '.join(row['issues'])}" for row in invalid_rows],
                "suggestions": suggestions,
                "summary": summary,
                "row_analysis": row_analysis[:25],
            }, status=status.HTTP_400_BAD_REQUEST)

        imported_count = 0
        skipped_count = len(invalid_rows)
        overwritten_count = 0
        import_motive, _ = MovementMotive.objects.get_or_create(
            name="Importación inicial",
            defaults={"description": "Alta inicial de existencias desde asistente de importación."},
        )
        lookups = build_import_catalog_lookups()

        for row in row_analysis:
            if row["status"] == "invalid":
                continue

            category_obj = resolve_catalog_for_import(
                row["category"], lookups["categories"], Category, create_enabled=create_categories
            )
            brand_obj = resolve_catalog_for_import(
                row["brand"], lookups["brands"], Brand, create_enabled=create_brands
            )
            unit_obj = resolve_catalog_for_import(
                row["unit"], lookups["units"], Unit, create_enabled=create_units
            )
            location_obj = resolve_location_for_import(
                row["location"], lookups["locations"], create_enabled=create_locations
            )

            if not all([category_obj, brand_obj, unit_obj, location_obj]):
                skipped_count += 1
                continue

            product = Product.objects.filter(code=row["code"]).first()
            is_overwrite = bool(product)
            if not product:
                product = Product(code=row["code"])

            product.description = row["description"]
            product.category = category_obj
            product.brand = brand_obj
            product.unit = unit_obj
            product.location = location_obj
            product.min_stock = row["stock_minimo"]
            product.status = row["estado"]
            product.observations = row["observaciones"]
            product.save()

            if is_overwrite:
                overwritten_count += 1

            desired_stock = row["existencia"]
            if is_overwrite:
                difference = desired_stock - product.stock
                if difference > 0:
                    Movement.objects.create(
                        product=product,
                        type='AJP',
                        quantity=difference,
                        responsible=request.user,
                        motive=import_motive,
                        observations="Ajuste por sobrescritura desde importación.",
                    )
                elif difference < 0:
                    Movement.objects.create(
                        product=product,
                        type='AJN',
                        quantity=abs(difference),
                        responsible=request.user,
                        motive=import_motive,
                        observations="Ajuste por sobrescritura desde importación.",
                    )
            elif desired_stock > 0:
                Movement.objects.create(
                    product=product,
                    type='ENT',
                    quantity=desired_stock,
                    responsible=request.user,
                    motive=import_motive,
                    observations="Existencia inicial importada desde archivo.",
                )

            imported_count += 1

        AuditLog.objects.create(
            user=request.user,
            action="IMPORT_EXCEL",
            details=f"Importados {imported_count} productos exitosamente desde archivo de Excel/CSV."
        )

        return Response({
            "message": f"Se importaron {imported_count} productos exitosamente.",
            "imported_count": imported_count,
            "skipped_count": skipped_count,
            "overwritten_count": overwritten_count,
            "summary": summary,
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def export(self, request):
        format_type = request.query_params.get('format', 'excel')
        products = self.get_queryset()

        if format_type == 'csv':
            response = HttpResponse(content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = 'attachment; filename="inventario.csv"'
            
            # Write UTF-8 BOM for proper loading in Excel
            response.write(u'\ufeff'.encode('utf8'))
            
            writer = csv.writer(response)
            writer.writerow(['Código', 'Descripción', 'Categoría', 'Marca', 'Unidad', 'Ubicación', 'Stock Mínimo', 'Existencia', 'Estado'])
            
            for p in products:
                writer.writerow([
                    p.code, p.description, p.category.name, p.brand.name,
                    p.unit.abbreviation, p.location.get_full_path(),
                    p.min_stock, p.stock, p.get_status_display()
                ])
            return response

        elif format_type == 'excel':
            wb = Workbook()
            ws = wb.active
            ws.title = "Inventario"
            
            # Headers
            ws.append(['Código', 'Descripción', 'Categoría', 'Marca', 'Unidad Abreviada', 'Ubicación Física', 'Stock Mínimo', 'Existencias', 'Estado'])
            
            for p in products:
                ws.append([
                    p.code, p.description, p.category.name, p.brand.name,
                    p.unit.abbreviation, p.location.get_full_path(),
                    p.min_stock, p.stock, p.get_status_display()
                ])
                
            response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            response['Content-Disposition'] = 'attachment; filename="inventario.xlsx"'
            wb.save(response)
            return response
            
        else:
            return Response({"error": "Formato de exportación no soportado."}, status=status.HTTP_400_BAD_REQUEST)


class MovementViewSet(viewsets.ModelViewSet):
    queryset = Movement.objects.all().order_by('-datetime')
    serializer_class = MovementSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = MovementPagination

    def get_queryset(self):
        queryset = Movement.objects.select_related('product', 'motive', 'responsible').order_by('-datetime')
        product_code = self.request.query_params.get('product_code', None)
        if product_code:
            queryset = queryset.filter(
                Q(product__code__icontains=product_code) |
                Q(product__description__icontains=product_code)
            )
            
        mtype = self.request.query_params.get('type', None)
        if mtype:
            queryset = queryset.filter(type=mtype)
            
        date_from = self.request.query_params.get('date_from', None)
        if date_from:
            queryset = queryset.filter(datetime__date__gte=date_from)

        date_to = self.request.query_params.get('date_to', None)
        if date_to:
            queryset = queryset.filter(datetime__date__lte=date_to)

        return queryset

    def perform_create(self, serializer):
        serializer.save(responsible=self.request.user)

    @action(detail=False, methods=['get'])
    def export(self, request):
        format_type = request.query_params.get('format', 'excel')
        movements = self.get_queryset()

        if format_type == 'csv':
            response = HttpResponse(content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = 'attachment; filename="movimientos.csv"'
            response.write(u'\ufeff'.encode('utf8'))
            writer = csv.writer(response)
            writer.writerow(['Fecha y Hora', 'Código Prod', 'Descripción Prod', 'Tipo Movimiento', 'Cantidad', 'Stock Anterior', 'Stock Resultante', 'Motivo', 'Responsable', 'Observaciones'])
            
            for m in movements:
                writer.writerow([
                    m.datetime.strftime('%Y-%m-%d %H:%M:%S'),
                    m.product.code, m.product.description,
                    m.get_type_display(), m.quantity,
                    m.previous_stock, m.result_stock,
                    m.motive.name, m.responsible.username,
                    m.observations
                ])
            return response

        elif format_type == 'excel':
            wb = Workbook()
            ws = wb.active
            ws.title = "Movimientos"
            ws.append(['Fecha y Hora', 'Código Material', 'Descripción', 'Tipo de Movimiento', 'Cantidad', 'Existencia Previa', 'Existencia Resultante', 'Motivo', 'Sub-inventario/Responsable', 'Observaciones'])
            
            for m in movements:
                ws.append([
                    m.datetime.strftime('%Y-%m-%d %H:%M:%S'),
                    m.product.code, m.product.description,
                    m.get_type_display(), m.quantity,
                    m.previous_stock, m.result_stock,
                    m.motive.name, m.responsible.username,
                    m.observations
                ])
                
            response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            response['Content-Disposition'] = 'attachment; filename="movimientos.xlsx"'
            wb.save(response)
            return response
            
        else:
            return Response({"error": "Formato de exportación no soportado."}, status=status.HTTP_400_BAD_REQUEST)


class SystemConfigViewSet(viewsets.ModelViewSet):
    queryset = SystemConfig.objects.all()
    serializer_class = SystemConfigSerializer
    permission_classes = [permissions.IsAuthenticated]

    # Allow custom GET on /api/config/
    @action(detail=False, methods=['get', 'put', 'patch'])
    def current(self, request):
        config = SystemConfig.get_config()
        if request.method == 'GET':
            serializer = self.get_serializer(config)
            return Response(serializer.data)
        else:
            serializer = self.get_serializer(config, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                
                # Audit config change
                AuditLog.objects.create(
                    user=request.user,
                    action="UPDATE_CONFIG",
                    details=f"Configuración del sistema actualizada."
                )
                
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related('user').all()
    serializer_class = AuditLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AuditPagination
    
    # We restrict delete/update so they are read-only logs
