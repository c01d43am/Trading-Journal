@echo off
setlocal
cd /d "%~dp0"

call npm --prefix "%~dp0..\dashboard-app" run build
if errorlevel 1 exit /b %errorlevel%

if exist "%~dp0..\.venv\Scripts\python.exe" (
    "%~dp0..\.venv\Scripts\python.exe" -m PyInstaller --noconfirm --clean --distpath ..\dist\TradingJournalCurrent build.spec
) else (
    py -3 -m PyInstaller --noconfirm --clean --distpath ..\dist\TradingJournalCurrent build.spec
)
if errorlevel 1 exit /b %errorlevel%

echo.
echo Build complete.
echo Output: ..\dist\TradingJournalCurrent\TradingJournalWeb\TradingJournal.exe
echo The executable includes the latest React dashboard.
echo Run the launcher beside the TradingJournal project folder.
