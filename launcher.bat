@echo off
setlocal

rem The app selects an available local port and opens that exact URL.
if exist "%~dp0.venv\Scripts\pythonw.exe" (
    start "" "%~dp0.venv\Scripts\pythonw.exe" "%~dp0required\app.py"
    exit /b 0
)

set "APP_EXE=%~dp0dist\TradingJournalCurrent\TradingJournalWeb\TradingJournal.exe"
if exist "%APP_EXE%" (
    start "" "%APP_EXE%"
    exit /b 0
)

where pyw.exe >nul 2>nul
if not errorlevel 1 (
    start "" pyw -3 "%~dp0required\app.py"
    exit /b 0
)

echo Trading Journal was not found.
echo Build the packaged app with required\build_windows.bat or install the project dependencies.
pause
exit /b 1
