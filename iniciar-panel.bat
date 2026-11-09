@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

title Panel Central de Pruebas Web
echo ==========================================================
echo   Iniciando Panel Central de Pruebas Web...
echo   El navegador se abrira solo en cuanto el panel este listo.
echo ==========================================================

where node >nul 2>&1
if errorlevel 1 (
    echo [AVISO] No se encontro Node.js en el PATH. Abriendo version local en el navegador...
    start "" "%~dp0public\index.html"
    exit /b 0
)

node server.js --abrir
echo.
echo El panel se detuvo.
pause
