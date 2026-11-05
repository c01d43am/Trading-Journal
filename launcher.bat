@echo off
setlocal
cd /d "%~dp0"

set "PYTHONW="
if exist "%~dp0.venv\Scripts\pythonw.exe" set "PYTHONW=%~dp0.venv\Scripts\pythonw.exe"

if not defined PYTHONW (
    where pyw.exe >nul 2>nul
    if not errorlevel 1 set "PYTHONW=pyw"
)

if defined PYTHONW (
    if exist "%~dp0dashboard-app\package.json" (
        where npm.cmd >nul 2>nul
        if not errorlevel 1 (
            echo Preparing the Trading Journal website...
            call npm --prefix "%~dp0dashboard-app" run build > "%TEMP%\TradingJournal-dashboard-build.log" 2>&1
            if errorlevel 1 (
                echo The Trading Journal website could not be built.
                type "%TEMP%\TradingJournal-dashboard-build.log"
                pause
                exit /b 1
            )
        ) else if not exist "%~dp0dashboard-app\dist\index.html" (
            echo Node.js and npm are required to build the dashboard.
            echo Install Node.js, then run this launcher again.
            pause
            exit /b 1
        )
    )

    start "" %PYTHONW% "%~dp0required\app.py"
    exit /b 0
)

set "APP_EXE=%~dp0dist\TradingJournalCurrent\TradingJournalWeb\TradingJournal.exe"
if exist "%APP_EXE%" (
    start "" "%APP_EXE%"
    exit /b 0
)

echo Trading Journal was not found.
echo Install Python or build the packaged app with required\build_windows.bat.
pause
exit /b 1
