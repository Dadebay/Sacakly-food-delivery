@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "agent=%~dp0A7-tagam-Print.exe"
if not exist "%agent%" (
  set "agent=%~dp0a7-tagam-print-agent-windows-amd64.exe"
  if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "agent=%~dp0a7-tagam-print-agent-windows-arm64.exe"
  if /I "%PROCESSOR_ARCHITECTURE%"=="x86" if not defined PROCESSOR_ARCHITEW6432 set "agent=%~dp0a7-tagam-print-agent-windows-386.exe"
)
"%agent%" -export-logs
if errorlevel 1 (
  echo Could not create the archive. Send a screenshot of this window.
) else (
  echo Send the A7-tagam-logs-*.zip file from this folder to support.
)
pause
