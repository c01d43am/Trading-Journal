@echo off
setlocal
cd /d "%~dp0"

py -3 -m PyInstaller --noconfirm --clean --distpath ..\dist build.spec
if errorlevel 1 exit /b %errorlevel%

echo.
echo Build complete.
echo Run the launcher beside the TradingJournal project folder.
