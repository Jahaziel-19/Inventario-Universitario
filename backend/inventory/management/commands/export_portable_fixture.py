import json
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core import serializers
from django.core.management.base import BaseCommand

from inventory.models import (
    AuditLog,
    Brand,
    Category,
    Location,
    Movement,
    MovementMotive,
    Product,
    SystemConfig,
    Unit,
)


SCRUBBED_FIELDS = {
    "product_image",
    "qr_code",
    "barcode",
    "related_document",
    "logo",
}


class Command(BaseCommand):
    help = "Exporta un fixture portable local con datos opcionales para carga inicial."

    def add_arguments(self, parser):
        parser.add_argument(
            "--output",
            default="fixtures/local_optional_seed.json",
            help="Ruta de salida relativa al backend o absoluta.",
        )

    def handle(self, *args, **options):
        user_model = get_user_model()
        output_value = options["output"]
        output_path = Path(output_value)
        if not output_path.is_absolute():
            output_path = Path.cwd() / output_path
        output_path.parent.mkdir(parents=True, exist_ok=True)

        objects = [
            *user_model.objects.all().order_by("id"),
            *Category.objects.all().order_by("id"),
            *Brand.objects.all().order_by("id"),
            *Unit.objects.all().order_by("id"),
            *MovementMotive.objects.all().order_by("id"),
            *Location.objects.all().order_by("id"),
            *Product.objects.all().order_by("id"),
            *Movement.objects.all().order_by("id"),
            *SystemConfig.objects.all().order_by("id"),
        ]

        payload = json.loads(serializers.serialize("json", objects))
        for entry in payload:
            fields = entry.get("fields", {})
            for field_name in SCRUBBED_FIELDS:
                fields.pop(field_name, None)

        output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        self.stdout.write(self.style.SUCCESS(f"Fixture exportado en: {output_path}"))
