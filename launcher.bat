@echo off
setlocal

set "APP_URL=http://127.0.0.1:5007/"
where curl.exe >nul 2>nul
if not errorlevel 1 (
    curl.exe --silent --fail --max-time 2 --noproxy "*" "%APP_URL%" | findstr /C:"launcher-current-ui-20261105" >nul
    if not errorlevel 1 (
        start "" "%APP_URL%"
        exit /b 0
    )
)

rem Prefer current source; pythonw avoids leaving a blank console window open.
if exist "%~dp0.venv\Scripts\pythonw.exe" (
    start "" "%~dp0.venv\Scripts\pythonw.exe" "%~dp0required\app.py" --port 5007
    exit /b 0
)

set "APP_EXE=%~dp0dist\TradingJournalCurrent\TradingJournalWeb\TradingJournal.exe"
if exist "%APP_EXE%" (
    start "" "%APP_EXE%"
    exit /b 0
)

where pyw >nul 2>nul
if not errorlevel 1 (
    start "" pyw -3 "%~dp0required\app.py" --port 5007
    exit /b 0
)

where py >nul 2>nul
if not errorlevel 1 (
    start "" /min py -3 "%~dp0required\app.py" --port 5007
    exit /b 0
)

echo Trading Journal was not found.
echo Build it with required\build_windows.bat or install Python and the required packages.
pause
exit /b 1
