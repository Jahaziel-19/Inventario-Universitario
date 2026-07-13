import os
import re
import unicodedata
import barcode
import qrcode
from io import BytesIO
from barcode.writer import ImageWriter
from barcode.errors import IllegalCharacterError
from django.db import models, transaction
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True, verbose_name="Nombre")
    description = models.TextField(blank=True, verbose_name="Descripción")
    is_active = models.BooleanField(default=True, verbose_name="Activo")

    class Meta:
        verbose_name = "Categoría"
        verbose_name_plural = "Categorías"

    def __str__(self):
        return self.name


class Brand(models.Model):
    name = models.CharField(max_length=100, unique=True, verbose_name="Nombre")
    is_active = models.BooleanField(default=True, verbose_name="Activo")

    class Meta:
        verbose_name = "Marca"
        verbose_name_plural = "Marcas"

    def __str__(self):
        return self.name


class Unit(models.Model):
    name = models.CharField(max_length=50, unique=True, verbose_name="Nombre")
    abbreviation = models.CharField(max_length=10, unique=True, verbose_name="Abreviación")
    is_active = models.BooleanField(default=True, verbose_name="Activo")

    class Meta:
        verbose_name = "Unidad de Medida"
        verbose_name_plural = "Unidades de Medida"

    def __str__(self):
        return f"{self.name} ({self.abbreviation})"


class MovementMotive(models.Model):
    name = models.CharField(max_length=100, unique=True, verbose_name="Motivo")
    description = models.TextField(blank=True, verbose_name="Descripción")
    is_active = models.BooleanField(default=True, verbose_name="Activo")

    class Meta:
        verbose_name = "Motivo de Movimiento"
        verbose_name_plural = "Motivos de Movimiento"

    def __str__(self):
        return self.name


class Location(models.Model):
    name = models.CharField(max_length=100, verbose_name="Nombre")
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children',
        verbose_name="Ubicación Padre"
    )
    is_active = models.BooleanField(default=True, verbose_name="Activo")

    class Meta:
        verbose_name = "Ubicación"
        verbose_name_plural = "Ubicaciones"
        unique_together = ('name', 'parent')

    def get_full_path(self):
        if self.parent:
            return f"{self.parent.get_full_path()} ➔ {self.name}"
        return self.name

    def __str__(self):
        return self.get_full_path()


class Product(models.Model):
    STATUS_CHOICES = [
        ('ACT', 'Activo'),
        ('INA', 'Inactivo'),
        ('OBS', 'Obsoleto'),
    ]

    code = models.CharField(max_length=50, unique=True, verbose_name="Código Interno")
    description = models.CharField(max_length=255, verbose_name="Descripción")
    category = models.ForeignKey(Category, on_delete=models.PROTECT, verbose_name="Categoría")
    brand = models.ForeignKey(Brand, on_delete=models.PROTECT, verbose_name="Marca")
    unit = models.ForeignKey(Unit, on_delete=models.PROTECT, verbose_name="Unidad de Medida")
    location = models.ForeignKey(Location, on_delete=models.PROTECT, verbose_name="Ubicación")
    min_stock = models.IntegerField(default=0, verbose_name="Stock Mínimo")
    status = models.CharField(max_length=3, choices=STATUS_CHOICES, default='ACT', verbose_name="Estado")
    stock = models.IntegerField(default=0, verbose_name="Stock Directo (Solo lectura)")
    observations = models.TextField(blank=True, verbose_name="Observaciones")
    product_image = models.ImageField(upload_to='product_images/', blank=True, null=True, verbose_name="Imagen del Producto")
    
    qr_code = models.ImageField(upload_to='product_qrs/', blank=True, null=True, verbose_name="Código QR")
    barcode = models.ImageField(upload_to='product_barcodes/', blank=True, null=True, verbose_name="Código de Barras")

    class Meta:
        verbose_name = "Producto"
        verbose_name_plural = "Productos"

    def clean(self):
        if self.min_stock < 0:
            raise ValidationError({"min_stock": "El stock mínimo no puede ser negativo."})

    def save(self, *args, **kwargs):
        self.clean()
        super(Product, self).save(*args, **kwargs)

    def generate_qr_image(self):
        qr = qrcode.QRCode(version=1, box_size=10, border=3)
        qr.add_data(self.code)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buffer = BytesIO()
        img.save(buffer, format="PNG")
        return buffer.getvalue()

    def get_barcode_payload(self):
        normalized = unicodedata.normalize("NFKD", self.code).encode("ascii", "ignore").decode("ascii")
        sanitized = ''.join(char for char in normalized if 32 <= ord(char) <= 126).strip()
        return sanitized or "PRODUCT-CODE"

    def generate_barcode_image(self):
        cod128 = barcode.get_barcode_class('code128')
        writer = ImageWriter()
        rv = BytesIO()
        barcode_payload = self.get_barcode_payload()
        try:
            cod128(barcode_payload, writer=writer).write(rv)
        except IllegalCharacterError:
            fallback_payload = re.sub(r'[^A-Za-z0-9._-]+', '', barcode_payload) or "PRODUCTCODE"
            cod128(fallback_payload, writer=writer).write(rv)
        return rv.getvalue()

    def __str__(self):
        return f"[{self.code}] {self.description}"


class Movement(models.Model):
    TYPE_CHOICES = [
        ('ENT', 'Entrada'),
        ('SAL', 'Salida'),
        ('AJP', 'Ajuste Positivo'),
        ('AJN', 'Ajuste Negativo'),
    ]

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='movements', verbose_name="Producto")
    type = models.CharField(max_length=3, choices=TYPE_CHOICES, verbose_name="Tipo de Movimiento")
    quantity = models.IntegerField(verbose_name="Cantidad")
    datetime = models.DateTimeField(auto_now_add=True, verbose_name="Fecha y Hora")
    responsible = models.ForeignKey(User, on_delete=models.PROTECT, verbose_name="Responsable")
    motive = models.ForeignKey(MovementMotive, on_delete=models.PROTECT, verbose_name="Motivo")
    observations = models.TextField(blank=True, verbose_name="Observaciones")
    related_document = models.FileField(upload_to='movement_docs/', blank=True, null=True, verbose_name="Documento Relacionado")
    
    # Kardex snapshot values
    previous_stock = models.IntegerField(editable=False, verbose_name="Stock Anterior")
    result_stock = models.IntegerField(editable=False, verbose_name="Stock Resultante")

    class Meta:
        verbose_name = "Movimiento de Inventario"
        verbose_name_plural = "Movimientos de Inventario"

    def clean(self):
        if self.quantity <= 0:
            raise ValidationError({"quantity": "La cantidad debe ser mayor que cero."})
        
        # Query the database for the freshest stock amount to avoid stale in-memory values
        if self.product.pk:
            try:
                current_stock = Product.objects.get(pk=self.product.pk).stock
            except Product.DoesNotExist:
                current_stock = 0
        else:
            current_stock = 0

        if self.type in ['SAL', 'AJN']:
            if current_stock < self.quantity:
                raise ValidationError({
                    "quantity": f"Stock insuficiente. Stock actual: {current_stock}, Cantidad solicitada: {self.quantity}"
                })

    @transaction.atomic
    def save(self, *args, **kwargs):
        self.clean()
        
        # We lock the product row to prevent concurrency issues
        product = Product.objects.select_for_update().get(pk=self.product.pk)
        
        self.previous_stock = product.stock
        
        if self.type in ['ENT', 'AJP']:
            product.stock += self.quantity
        elif self.type in ['SAL', 'AJN']:
            product.stock -= self.quantity
            
        self.result_stock = product.stock
        product.save()
        
        super(Movement, self).save(*args, **kwargs)
        
        # Create an audit log record for the stock change
        AuditLog.objects.create(
            user=self.responsible,
            action="CREATE_MOVEMENT",
            details=f"Movimiento {self.get_type_display()} de {self.quantity} unidades para {product.code}. Stock: {self.previous_stock} -> {self.result_stock}"
        )

    def __str__(self):
        return f"{self.get_type_display()} - {self.quantity} - {self.product.code}"


class SystemConfig(models.Model):
    institution_name = models.CharField(max_length=255, default="TECNM", verbose_name="Nombre de la Institución")
    logo = models.ImageField(upload_to='config/', blank=True, null=True, verbose_name="Logotipo Institucional")
    default_min_stock = models.IntegerField(default=5, verbose_name="Stock Mínimo por Defecto")
    code_prefix = models.CharField(max_length=10, default="INV", verbose_name="Prefijo de Códigos")

    class Meta:
        verbose_name = "Configuración del Sistema"
        verbose_name_plural = "Configuraciones del Sistema"

    def save(self, *args, **kwargs):
        # Enforce singleton
        self.pk = 1
        super(SystemConfig, self).save(*args, **kwargs)

    @classmethod
    def get_config(cls):
        config, created = cls.objects.get_or_create(pk=1)
        return config

    def __str__(self):
        return f"Configuración: {self.institution_name}"


class AuditLog(models.Model):
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, verbose_name="Usuario")
    timestamp = models.DateTimeField(auto_now_add=True, verbose_name="Fecha y Hora")
    action = models.CharField(max_length=100, verbose_name="Acción")
    details = models.TextField(verbose_name="Detalles")

    class Meta:
        verbose_name = "Bitácora de Auditoría"
        verbose_name_plural = "Bitácoras de Auditoría"
        ordering = ['-timestamp']

    def __str__(self):
        return f"[{self.timestamp.strftime('%Y-%m-%d %H:%M:%S')}] - {self.user} - {self.action}"
