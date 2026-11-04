@echo off
setlocal

rem Prefer the current source so launcher users receive UI and data fixes without a rebuild.
if exist "%~dp0.venv\Scripts\python.exe" (
    start "Trading Journal" "%~dp0.venv\Scripts\python.exe" "%~dp0required\app.py"
    exit /b 0
)

where py >nul 2>nul
if not errorlevel 1 (
    start "" py -3 "%~dp0required\app.py"
    exit /b 0
)

set "APP_EXE=%~dp0dist\TradingJournalWeb\TradingJournal.exe"
if exist "%APP_EXE%" (
    start "" "%APP_EXE%"
    exit /b 0
)

echo Trading Journal was not found.
echo Build it with required\build_windows.bat or install Python and the required packages.
pause
exit /b 1
