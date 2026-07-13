@echo off
setlocal

cd /d "%~dp0"

set "ROOT_DIR=%CD%"
set "BACKEND_DIR=%ROOT_DIR%\backend"
set "FRONTEND_DIR=%ROOT_DIR%\frontend"
set "VENV_DIR=%BACKEND_DIR%\.venv"
set "BACKEND_ENV=%BACKEND_DIR%\.env"
set "BACKEND_ENV_EXAMPLE=%BACKEND_DIR%\.env.prod_sqlite.example"
set "FRONTEND_ENV=%FRONTEND_DIR%\.env.production.local"
set "FIXTURE_FILE=%BACKEND_DIR%\fixtures\local_optional_seed.json"
set "LOAD_FIXTURE=N"
set "HIDE_TERMINALS=N"

echo [1/8] Preparando archivos de entorno...
if not exist "%BACKEND_ENV%" (
    copy "%BACKEND_ENV_EXAMPLE%" "%BACKEND_ENV%" >nul
)

if not exist "%FRONTEND_ENV%" (
    > "%FRONTEND_ENV%" echo VITE_API_BASE_URL=http://127.0.0.1:8000
    >> "%FRONTEND_ENV%" echo VITE_MEDIA_BASE_URL=http://127.0.0.1:8000
    >> "%FRONTEND_ENV%" echo VITE_PROXY_TARGET=http://127.0.0.1:8000
)

echo [2/8] Detectando Python...
where py >nul 2>&1
if %errorlevel%==0 (
    set "PYTHON_CMD=py -3"
) else (
    where python >nul 2>&1
    if errorlevel 1 (
        echo No se encontro Python.
        pause
        exit /b 1
    )
    set "PYTHON_CMD=python"
)

echo [3/8] Creando entorno virtual si hace falta...
if not exist "%VENV_DIR%\Scripts\python.exe" (
    %PYTHON_CMD% -m venv "%VENV_DIR%"
    if errorlevel 1 (
        echo ERROR: Fallo al crear el entorno virtual.
        pause
        exit /b 1
    )
)

call "%VENV_DIR%\Scripts\activate.bat"
if errorlevel 1 (
    echo ERROR: Fallo al activar el entorno virtual.
    pause
    exit /b 1
)

if exist "%FIXTURE_FILE%" (
    set /p LOAD_FIXTURE=Deseas cargar el fixture opcional local_optional_seed.json^? [s/N]: 
)
::set /p HIDE_TERMINALS=Deseas ocultar las terminales de backend y frontend^? [s/N]: 

echo [4/8] Instalando dependencias de backend...
python -m pip install --upgrade pip
if errorlevel 1 (
    echo ERROR: Fallo al actualizar pip.
    pause
    exit /b 1
)
pip install -r "%BACKEND_DIR%\requirements.txt"
if errorlevel 1 (
    echo ERROR: Fallo al instalar dependencias de backend.
    pause
    exit /b 1
)

echo [5/8] Generando migraciones, aplicandolas y recolectando estaticos...
set "DJANGO_SETTINGS_MODULE=inventario.settings.prod_sqlite"
pushd "%BACKEND_DIR%"
python manage.py makemigrations --settings=inventario.settings.prod_sqlite
if errorlevel 1 (
    echo ERROR: Fallo al generar migraciones.
    pause
    exit /b 1
)
python manage.py migrate --settings=inventario.settings.prod_sqlite
if errorlevel 1 (
    echo ERROR: Fallo al aplicar migraciones.
    echo Si la base de datos ya existia y hay conflicto de esquema, borra backend/db.prod.sqlite3 y vuelve a ejecutar.
    pause
    exit /b 1
)
if /I "%LOAD_FIXTURE%"=="S" (
    echo Restaurando base desde fixture opcional...
    python manage.py flush --noinput --settings=inventario.settings.prod_sqlite
    if errorlevel 1 (
        echo ERROR: Fallo al vaciar la base de datos.
        pause
        exit /b 1
    )
    python manage.py loaddata "%FIXTURE_FILE%" --settings=inventario.settings.prod_sqlite
    if errorlevel 1 (
        echo ADVERTENCIA: El fixture opcional no se pudo cargar.
        echo Se continuara con la base de datos vacia.
    )
)
python manage.py ensure_default_admin --username admin --password admin123 --settings=inventario.settings.prod_sqlite
if errorlevel 1 (
    echo ERROR: Fallo al crear el administrador por defecto.
    pause
    exit /b 1
)
python manage.py collectstatic --noinput --settings=inventario.settings.prod_sqlite
if errorlevel 1 (
    echo ERROR: Fallo al recolectar archivos estaticos.
    pause
    exit /b 1
)
popd

echo [6/8] Instalando dependencias de frontend...
where npm >nul 2>&1
if errorlevel 1 (
    echo No se encontro npm. Instala Node.js antes de continuar.
    pause
    exit /b 1
)

pushd "%FRONTEND_DIR%"
if exist package-lock.json (
    call npm ci
    if errorlevel 1 (
        echo npm ci fallo, intentando con npm install...
        call npm install
    )
) else (
    call npm install
)
if errorlevel 1 (
    echo ERROR: No se pudieron instalar las dependencias del frontend.
    pause
    exit /b 1
)

echo [7/8] Construyendo frontend...
call npm run build
if errorlevel 1 (
    echo ERROR: Fallo al construir el frontend.
    pause
    exit /b 1
)
popd

echo [8/8] Iniciando servicios...
start "Inventario Backend" "%ROOT_DIR%\run_backend_prod_sqlite.bat"
start "Inventario Frontend" "%ROOT_DIR%\run_frontend_preview.bat"
start "Inventario Browser" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Sleep -Seconds 6; Start-Process 'http://127.0.0.1:4173'"

echo.
echo Proyecto iniciado.
echo Backend:  http://127.0.0.1:8000
echo Frontend: http://127.0.0.1:4173
echo.
echo Si necesitas ajustar hosts, puertos o secretos, edita:
echo - backend\.env
echo - frontend\.env.production.local

exit /b 0
