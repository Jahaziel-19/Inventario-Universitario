from django.test import TestCase
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework.test import APIClient
from .models import Category, Brand, Unit, MovementMotive, Location, Product, Movement


class InventoryTests(TestCase):
    def setUp(self):
        # Create user
        self.user = User.objects.create_user(username='tester', password='password123')
        
        # Create Catalogs
        self.category = Category.objects.create(name='Computadoras', description='Equipos de computo')
        self.brand = Brand.objects.create(name='Dell')
        self.unit = Unit.objects.create(name='Pieza', abbreviation='PZ')
        self.location = Location.objects.create(name='Almacen A')
        self.motive_in = MovementMotive.objects.create(name='Compra')
        self.motive_out = MovementMotive.objects.create(name='Salida a departamento')

        # Create Product
        self.product = Product.objects.create(
            code='DELL-LAT-5420',
            description='Laptop Dell Latitude 5420',
            category=self.category,
            brand=self.brand,
            unit=self.unit,
            location=self.location,
            min_stock=2
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_product_creation_and_label_generation(self):
        """Verifica que el producto se crea y genera automáticamente sus imágenes QR y Barcode."""
        self.assertIsNotNone(self.product.qr_code)
        self.assertIsNotNone(self.product.barcode)
        self.assertTrue(self.product.qr_code.name.startswith('product_qrs/qr_DELL-LAT-5420'))
        self.assertTrue(self.product.barcode.name.startswith('product_barcodes/barcode_DELL-LAT-5420'))
        self.assertEqual(self.product.stock, 0)

    def test_product_with_enye_generates_barcode_without_error(self):
        product = Product.objects.create(
            code='CAÑ-001',
            description='Producto con letra especial',
            category=self.category,
            brand=self.brand,
            unit=self.unit,
            location=self.location,
            min_stock=1
        )

        self.assertIsNotNone(product.barcode)
        self.assertIn('product_barcodes/barcode_', product.barcode.name)

    def test_positive_movement_updates_stock(self):
        """Verifica que un movimiento de Entrada incremente el stock del producto."""
        m = Movement.objects.create(
            product=self.product,
            type='ENT',
            quantity=10,
            responsible=self.user,
            motive=self.motive_in,
            observations='Carga inicial compra'
        )
        # Reload product
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)
        self.assertEqual(m.previous_stock, 0)
        self.assertEqual(m.result_stock, 10)

    def test_negative_movement_checks_insufficient_stock(self):
        """Verifica que no se permita registrar salidas con cantidades mayores a las existencias."""
        # Stock is currently 0, trying to check out 1 unit should fail
        with self.assertRaises(ValidationError):
            m = Movement(
                product=self.product,
                type='SAL',
                quantity=1,
                responsible=self.user,
                motive=self.motive_out
            )
            m.save()
            
        # Verify product stock is still 0
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 0)

    def test_negative_movement_updates_stock_when_sufficient(self):
        """Verifica que una salida válida reduzca el stock correctamente."""
        # 1. Add stock first
        Movement.objects.create(
            product=self.product,
            type='ENT',
            quantity=10,
            responsible=self.user,
            motive=self.motive_in
        )
        
        # Fresh refresh from db
        self.product.refresh_from_db()
        
        # 2. Register output
        m = Movement.objects.create(
            product=self.product,
            type='SAL',
            quantity=4,
            responsible=self.user,
            motive=self.motive_out
        )
        
        # 3. Reload and check
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 6)
        self.assertEqual(m.previous_stock, 10)
        self.assertEqual(m.result_stock, 6)

    def test_import_csv_creates_product_successfully(self):
        csv_content = (
            "codigo,descripcion,categoria,marca,unidad,ubicacion,stock_minimo\n"
            "PAP-001,Papel tamaño carta,Computadoras,Dell,PZ,Almacen A,3\n"
        )
        uploaded_file = SimpleUploadedFile(
            "inventario.csv",
            csv_content.encode("utf-8"),
            content_type="text/csv",
        )

        response = self.client.post(
            reverse("product-import-excel"),
            {
                "file": uploaded_file,
                "create_categories": "false",
                "create_brands": "false",
                "create_units": "false",
                "create_locations": "false",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(Product.objects.filter(code="PAP-001").exists())

    def test_import_csv_with_enye_code_does_not_fail_barcode_generation(self):
        csv_content = (
            "codigo,descripcion,categoria,marca,unidad,ubicacion,stock_minimo\n"
            "CAÑ-002,Producto importado con enye,Computadoras,Dell,PZ,Almacen A,3\n"
        )
        uploaded_file = SimpleUploadedFile(
            "inventario_enye.csv",
            csv_content.encode("utf-8"),
            content_type="text/csv",
        )

        response = self.client.post(
            reverse("product-import-excel"),
            {
                "file": uploaded_file,
                "create_categories": "false",
                "create_brands": "false",
                "create_units": "false",
                "create_locations": "false",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        imported_product = Product.objects.get(code="CAÑ-002")
        self.assertIsNotNone(imported_product.barcode)

    def test_import_preview_detects_mapping_and_optional_stock(self):
        csv_content = (
            "sku,nombre,categoria,marca,unidad,ubicacion,existencias,minimo\n"
            "MON-001,Monitor 24 pulgadas,Computadoras,Dell,PZ,Almacen A,7,2\n"
        )
        uploaded_file = SimpleUploadedFile(
            "preview.csv",
            csv_content.encode("utf-8"),
            content_type="text/csv",
        )

        response = self.client.post(
            reverse("product-import-preview"),
            {"file": uploaded_file},
            format="multipart",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["mapping"]["codigo"], "sku")
        self.assertEqual(response.data["mapping"]["descripcion"], "nombre")
        self.assertEqual(response.data["mapping"]["existencia"], "existencias")
        self.assertEqual(response.data["summary"]["invalid_rows"], 0)

    def test_import_csv_with_mapping_creates_initial_stock(self):
        csv_content = (
            "sku,nombre,categoria,marca,unidad,ubicacion,existencias,minimo,estado,notas\n"
            "IMP-100,Impresora laser,Computadoras,Dell,PZ,Almacen A,5,1,activo,Equipo de oficina\n"
        )
        uploaded_file = SimpleUploadedFile(
            "inventario_mapeado.csv",
            csv_content.encode("utf-8"),
            content_type="text/csv",
        )

        response = self.client.post(
            reverse("product-import-excel"),
            {
                "file": uploaded_file,
                "create_categories": "false",
                "create_brands": "false",
                "create_units": "false",
                "create_locations": "false",
                "mapping": '{"codigo":"sku","descripcion":"nombre","categoria":"categoria","marca":"marca","unidad":"unidad","ubicacion":"ubicacion","existencia":"existencias","stock_minimo":"minimo","estado":"estado","observaciones":"notas"}',
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        imported_product = Product.objects.get(code="IMP-100")
        self.assertEqual(imported_product.stock, 5)
        self.assertEqual(imported_product.min_stock, 1)
        self.assertEqual(imported_product.status, "ACT")
        self.assertTrue(
            Movement.objects.filter(product=imported_product, motive__name="Importación inicial", quantity=5).exists()
        )

    def test_import_preview_reports_invalid_duplicate_rows(self):
        csv_content = (
            "codigo,descripcion,categoria,marca,unidad,ubicacion\n"
            "DELL-LAT-5420,Laptop duplicada,Computadoras,Dell,PZ,Almacen A\n"
        )
        uploaded_file = SimpleUploadedFile(
            "duplicados.csv",
            csv_content.encode("utf-8"),
            content_type="text/csv",
        )

        response = self.client.post(
            reverse("product-import-preview"),
            {"file": uploaded_file},
            format="multipart",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["summary"]["invalid_rows"], 1)
        self.assertEqual(response.data["row_analysis"][0]["status"], "invalid")

    def test_import_csv_can_skip_invalid_rows(self):
        csv_content = (
            "codigo,descripcion,categoria,marca,unidad,ubicacion\n"
            "VAL-001,Producto correcto,Computadoras,Dell,PZ,Almacen A\n"
            "BAD-001,Producto sin marca,Computadoras,Marca inexistente,PZ,Almacen A\n"
        )
        uploaded_file = SimpleUploadedFile(
            "omitir_invalidos.csv",
            csv_content.encode("utf-8"),
            content_type="text/csv",
        )

        response = self.client.post(
            reverse("product-import-excel"),
            {
                "file": uploaded_file,
                "skip_invalid_rows": "true",
                "create_categories": "false",
                "create_brands": "false",
                "create_units": "false",
                "create_locations": "false",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(Product.objects.filter(code="VAL-001").exists())
        self.assertFalse(Product.objects.filter(code="BAD-001").exists())
        self.assertEqual(response.data["skipped_count"], 1)

    def test_import_csv_can_overwrite_existing_product(self):
        Movement.objects.create(
            product=self.product,
            type='ENT',
            quantity=2,
            responsible=self.user,
            motive=self.motive_in,
        )

        csv_content = (
            "codigo,descripcion,categoria,marca,unidad,ubicacion,existencia,stock_minimo,estado\n"
            "DELL-LAT-5420,Laptop actualizada,Computadoras,Dell,PZ,Almacen A,6,4,activo\n"
        )
        uploaded_file = SimpleUploadedFile(
            "sobrescribir.csv",
            csv_content.encode("utf-8"),
            content_type="text/csv",
        )

        response = self.client.post(
            reverse("product-import-excel"),
            {
                "file": uploaded_file,
                "overwrite_existing": "true",
                "create_categories": "false",
                "create_brands": "false",
                "create_units": "false",
                "create_locations": "false",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        self.product.refresh_from_db()
        self.assertEqual(self.product.description, "Laptop actualizada")
        self.assertEqual(self.product.min_stock, 4)
        self.assertEqual(self.product.stock, 6)
        self.assertEqual(response.data["overwritten_count"], 1)

    def test_import_csv_accepts_comma_separated_location_hierarchy(self):
        pasillo = Location.objects.create(name='Pasillo2', parent=self.location)
        loker = Location.objects.create(name='Loker4', parent=pasillo)
        repisa = Location.objects.create(name='rep2', parent=loker)

        csv_content = (
            "codigo,descripcion,categoria,marca,unidad,ubicacion\n"
            "JER-001,Producto jerarquico,Computadoras,Dell,PZ,Pasillo2,Loker4,rep2\n"
        )
        csv_content = csv_content.replace("Pasillo2,Loker4,rep2", '"Pasillo2,Loker4,rep2"')
        uploaded_file = SimpleUploadedFile(
            "ubicacion_comas.csv",
            csv_content.encode("utf-8"),
            content_type="text/csv",
        )

        response = self.client.post(
            reverse("product-import-excel"),
            {
                "file": uploaded_file,
                "create_categories": "false",
                "create_brands": "false",
                "create_units": "false",
                "create_locations": "false",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        imported_product = Product.objects.get(code="JER-001")
        self.assertEqual(imported_product.location_id, repisa.id)

    def test_custom_motive_is_created_when_registering_movement(self):
        response = self.client.post(
            reverse("movement-list"),
            {
                "product": self.product.id,
                "type": "ENT",
                "quantity": 2,
                "custom_motive": "Donación extraordinaria",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(
            Movement.objects.filter(motive__name="Donación extraordinaria").exists()
        )
