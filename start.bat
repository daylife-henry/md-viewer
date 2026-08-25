@echo off
chcp 65001 >nul
setlocal
set "APP=%~dp0"
set "PYTHON=%APP%python\python.exe"
if not exist "%PYTHON%" (
  echo [ERROR] Portable Python not found: md-viewer\python\python.exe
  echo Please copy the entire md-viewer folder.
  pause
  exit /b 1
)
"%PYTHON%" "%APP%app.py" %*
endlocal
