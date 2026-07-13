@echo off
setlocal

cd /d "%~dp0backend"
set "DJANGO_SETTINGS_MODULE=inventario.settings.prod_sqlite"

if not exist ".venv\Scripts\python.exe" (
    echo No se encontro el entorno virtual en backend\.venv
    echo Ejecuta primero start_prod_sqlite.bat para instalar las dependencias.
    pause
    exit /b 1
)

call ".venv\Scripts\activate.bat"

echo Aplicando migraciones...
python manage.py migrate --settings=inventario.settings.prod_sqlite
if errorlevel 1 (
    echo ERROR: Fallo al aplicar migraciones.
    pause
    exit /b 1
)

if not exist "staticfiles" (
    echo Recolectando archivos estaticos (collectstatic)...
    python manage.py collectstatic --noinput --settings=inventario.settings.prod_sqlite
    if errorlevel 1 (
        echo ERROR: Fallo al recolectar archivos estaticos.
        pause
        exit /b 1
    )
)

python manage.py ensure_default_admin --username admin --password admin123 --settings=inventario.settings.prod_sqlite

".venv\Scripts\python.exe" -m waitress --host=127.0.0.1 --port=8000 inventario.wsgi:application
