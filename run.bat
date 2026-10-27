@echo off
REM -------------------------------------------------------------
REM  Estudio Biblico - ejecutar en Windows 10/11 (x64, ARM64 o x86)
REM  Si falta Python, lo instala (solo para el usuario, sin administrador),
REM  crea el entorno virtual e instala dependencias: scripts\setup.ps1
REM    run.bat                  abre la aplicacion sin consola
REM    run.bat --setup          solo prepara el entorno (si falta o esta danado)
REM    run.bat --selftest       valida el arranque (con consola)
REM    run.bat --debug          registro detallado (con consola)
REM -------------------------------------------------------------
setlocal
REM pushd (no "cd /d") para admitir carpetas de red / compartidas de la VM
pushd "%~dp0" || goto :nodir

set "VPY=.venv\Scripts\python.exe"
set "NEEDSETUP="
if not exist ".venv\.instalado" set "NEEDSETUP=1"
REM Entorno danado (p. ej. se desinstalo el Python con que se creo)
if not defined NEEDSETUP "%VPY%" -c "import sys" >nul 2>&1 || set "NEEDSETUP=1"

if defined NEEDSETUP (
    powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\setup.ps1" || goto :error
)
if /i "%~1"=="--setup" goto :end

if "%~1"=="" (
    start "" ".venv\Scripts\pythonw.exe" main.py
    goto :end
)
"%VPY%" main.py %*
set "RC=%ERRORLEVEL%"
popd
exit /b %RC%

:end
popd
exit /b 0

:nodir
echo No se pudo acceder a la carpeta del programa.
pause
exit /b 1

:error
echo.
echo No se pudo preparar la aplicacion. Revise los mensajes anteriores.
popd
pause
exit /b 1
