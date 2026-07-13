@echo off
setlocal

cd /d "%~dp0frontend"
call npm run preview -- --host 127.0.0.1 --port 4173
