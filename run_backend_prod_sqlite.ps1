Set-Location (Join-Path $PSScriptRoot "backend")
$env:DJANGO_SETTINGS_MODULE = "inventario.settings.prod_sqlite"
& ".\.venv\Scripts\python.exe" -m waitress --host=127.0.0.1 --port=8000 inventario.wsgi:application
