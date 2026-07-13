@echo off
setlocal

cd /d "%~dp0frontend"

where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js no esta instalado en este equipo.
    echo Descarga e instala Node.js (https://nodejs.org) y vuelve a intentar.
    pause
    exit /b 1
)

if not exist "node_modules\.bin\vite.cmd" (
    echo Dependencias del frontend no encontradas. Instalando...
    call npm install
    if errorlevel 1 (
        echo ERROR: Fallo la instalacion de dependencias (¿sin conexion a internet?).
        pause
        exit /b 1
    )
)

if not exist "dist" (
    echo Construyendo el frontend (npm run build)...
    call npm run build
    if errorlevel 1 (
        echo ERROR: Fallo la construccion del frontend.
        pause
        exit /b 1
    )
)

call npm run preview -- --host 127.0.0.1 --port 4173
