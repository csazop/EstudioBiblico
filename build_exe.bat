@echo off
REM -------------------------------------------------------------
REM  Genera dist\EstudioBiblico\EstudioBiblico.exe con PyInstaller
REM  (x64 o ARM64 segun el Python instalado)
REM -------------------------------------------------------------
setlocal
pushd "%~dp0" || exit /b 1

call run.bat --setup || goto :error
set "VPY=.venv\Scripts\python.exe"
if not exist "%VPY%" goto :error
"%VPY%" -m pip install --disable-pip-version-check -r requirements-dev.txt || goto :error

set "EXTRA="
if exist "assets\app.ico" set "EXTRA=--icon assets\app.ico"
REM pywebview/pythonnet solo existen en Windows x64 (en ARM64 se usa Edge en modo app)
"%VPY%" -c "import webview" >nul 2>&1 && set "EXTRA=%EXTRA% --collect-all webview --collect-all pythonnet --collect-all clr_loader"

"%VPY%" -m PyInstaller --noconfirm --clean --windowed --name EstudioBiblico %EXTRA% --add-data "web;web" main.py || goto :error

echo.
echo Listo: dist\EstudioBiblico\EstudioBiblico.exe
echo Copie la carpeta dist\EstudioBiblico completa al equipo destino.
echo Validar: dist\EstudioBiblico\EstudioBiblico.exe --selftest  (codigo 0 = OK, ver app.log)
popd
pause
exit /b 0

:error
echo.
echo ERROR durante la compilacion.
popd
pause
exit /b 1
