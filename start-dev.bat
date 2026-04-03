@echo off
setlocal
set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"
set "PS_CMD=Start-Process cmd.exe -WindowStyle Hidden -WorkingDirectory '%APP_DIR%' -ArgumentList '/c npm run dev'"
powershell -NoProfile -WindowStyle Hidden -Command "%PS_CMD%"
endlocal
exit /b 0
