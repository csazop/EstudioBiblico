@echo off
REM -------------------------------------------------------------
REM  Genera diagnostico.txt con informacion del sistema y el
REM  resultado de la autoprueba de arranque, para soporte.
REM -------------------------------------------------------------
setlocal
pushd "%~dp0" || exit /b 1
set "OUT=%~dp0diagnostico.txt"

echo Preparando entorno y generando diagnostico, espere...
> "%OUT%" (
    echo ==== Sistema
    ver
    echo PROCESSOR_ARCHITECTURE=%PROCESSOR_ARCHITECTURE% PROCESSOR_ARCHITEW6432=%PROCESSOR_ARCHITEW6432%
    echo ==== Python disponible
    where py python 2>&1
    py -0p 2>&1
    echo ==== Edge
    reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" /ve 2>&1
    echo ==== Autoprueba
)
call run.bat --setup || goto :fin
call run.bat --selftest --debug >> "%OUT%" 2>&1
echo Codigo de salida: %ERRORLEVEL% >> "%OUT%"
if exist "%LOCALAPPDATA%\EstudioBiblico\app.log" (
    echo ==== Ultimas lineas de app.log >> "%OUT%"
    powershell -NoProfile -Command "Get-Content -Tail 40 -Encoding UTF8 '%LOCALAPPDATA%\EstudioBiblico\app.log'" >> "%OUT%" 2>&1
)
popd
echo Listo: %OUT%
notepad "%OUT%"
exit /b 0

:fin
popd
pause
exit /b 1
