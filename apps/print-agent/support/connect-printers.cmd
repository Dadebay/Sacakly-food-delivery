@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "agent=%~dp0A7-tagam-Print.exe"
if not exist "%agent%" (
  set "agent=%~dp0a7-tagam-print-agent-windows-amd64.exe"
  if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "agent=%~dp0a7-tagam-print-agent-windows-arm64.exe"
  if /I "%PROCESSOR_ARCHITECTURE%"=="x86" if not defined PROCESSOR_ARCHITEW6432 set "agent=%~dp0a7-tagam-print-agent-windows-386.exe"
)
echo Аппараты и блюда программа получает из A7-tagam. Адреса вводить не нужно.
echo Оставьте открытым окно программы печати. Сайт для печати не требуется. При запросе Windows нажмите «Да».
echo Если начнётся настройка, дождитесь «Подключение готово». Очередь повторит отправку.
"%agent%" -connect-printers -network-interface "Ethernet" -network-prefix 24 -network-reserved "192.168.123.10,192.168.0.240"
if errorlevel 1 (
  echo Программа остановилась с ошибкой. Сохраняю журналы для проверки.
  "%agent%" -export-logs
  echo Пришлите появившийся файл A7-tagam-logs-*.zip и фото этого окна.
  pause
  exit /b 1
)
