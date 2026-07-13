@echo off
setlocal

cd /d "%~dp0backend"
set "DJANGO_SETTINGS_MODULE=inventario.settings.prod_sqlite"

if not exist ".venv\Scripts\python.exe" (
    echo No se encontro el entorno virtual en backend\.venv
    exit /b 1
)

".venv\Scripts\python.exe" -m waitress --host=127.0.0.1 --port=8000 inventario.wsgi:application
