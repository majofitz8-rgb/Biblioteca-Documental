@echo off
rem Abre la Biblioteca Técnica en http://localhost:8766/ (solo esta PC). Cierra esta ventana para detener el servidor.
cd /d "%~dp0"
start "" http://localhost:8766/
python -m http.server 8766
