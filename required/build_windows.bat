@echo off
setlocal
cd /d "%~dp0"

if exist "%~dp0..\.venv\Scripts\python.exe" (
    "%~dp0..\.venv\Scripts\python.exe" -m PyInstaller --noconfirm --clean --distpath ..\dist build.spec
) else (
    py -3 -m PyInstaller --noconfirm --clean --distpath ..\dist build.spec
)
if errorlevel 1 exit /b %errorlevel%

echo.
echo Build complete.
echo Output: ..\dist\TradingJournalWeb\TradingJournal.exe
echo Run the launcher beside the TradingJournal project folder.
