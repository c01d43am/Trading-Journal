@echo off
setlocal
set "PROJECT_ROOT=%~dp0.."
set "VENV_PYTHON=%PROJECT_ROOT%\.venv\Scripts\python.exe"
set "DIST_ROOT=%~1"
if not defined DIST_ROOT set "DIST_ROOT=%PROJECT_ROOT%\dist"
cd /d "%~dp0"

if not exist "%VENV_PYTHON%" (
  py -3 -m venv "%PROJECT_ROOT%\.venv"
  if errorlevel 1 (
    echo Could not create the Python build environment.
    exit /b 1
  )
)

"%VENV_PYTHON%" -m pip install --disable-pip-version-check -r "%~dp0requirements.txt"
if errorlevel 1 (
  echo Could not install the application build dependencies.
  exit /b 1
)

"%VENV_PYTHON%" -m PyInstaller --noconfirm --clean --distpath "%DIST_ROOT%" --workpath ..\build build.spec
if errorlevel 1 exit /b 1

set "SOURCE_COMMIT="
for /f "delims=" %%C in ('git -C "%PROJECT_ROOT%" rev-parse HEAD 2^>nul') do set "SOURCE_COMMIT=%%C"
if defined SOURCE_COMMIT (
  >"%DIST_ROOT%\TradingJournalProfileIsolationHeaderAlert\.source-commit" echo %SOURCE_COMMIT%
)

echo.
echo Build complete.
echo Output: %DIST_ROOT%\TradingJournalProfileIsolationHeaderAlert\TradingJournal.exe
echo Run the launcher beside the TradingJournal project folder.
