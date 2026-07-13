@echo off
echo Deteniendo solo los procesos de Inventario...

:: Cierra el backend buscando por el título de la ventana definido en tu start_prod_sqlite.bat
taskkill /F /FI "WINDOWTITLE eq Inventario Backend" /T >nul 2>&1

:: Cierra el frontend buscando por el título de la ventana definido en tu start_prod_sqlite.bat
taskkill /F /FI "WINDOWTITLE eq Inventario Frontend" /T >nul 2>&1

:: Cierra el proceso del navegador si tuviera ese título
taskkill /F /FI "WINDOWTITLE eq Inventario Browser" /T >nul 2>&1

echo Procesos de Inventario detenidos.
timeout /t 2 >nul