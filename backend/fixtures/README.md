Este directorio puede contener fixtures opcionales para carga inicial portable.

Archivo esperado por el script:
- `local_optional_seed.json`

Puedes generarlo desde el backend con:

```bash
python manage.py export_portable_fixture --settings=inventario.settings.prod_sqlite
```

Notas:
- El fixture local queda ignorado por Git.
- Se excluyen rutas de archivos pesados como QR, barcode, imagen de producto, logo y documentos relacionados.
