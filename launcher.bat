@echo off
setlocal
set "ROOT=%~dp0"
set "SOURCE_COMMIT="
for /f "delims=" %%C in ('git -C "%ROOT%" rev-parse HEAD 2^>nul') do set "SOURCE_COMMIT=%%C"
if defined SOURCE_COMMIT set "AUTO_DIST=%LOCALAPPDATA%\TradingJournal\launcher-builds-v3-%SOURCE_COMMIT%"
set "APP_EXE=%AUTO_DIST%\TradingJournalProfileIsolationHeaderAlert\TradingJournal.exe"
if not exist "%APP_EXE%" set "APP_EXE=%ROOT%dist\TradingJournalProfileIsolationHeaderAlert\TradingJournal.exe"
if not exist "%APP_EXE%" set "APP_EXE=%ROOT%dist\TradingJournalProfileIsolationUpdateStatus\TradingJournal.exe"
if not exist "%APP_EXE%" set "APP_EXE=%ROOT%dist\TradingJournalProfileIsolationNetFx\TradingJournal.exe"
if not exist "%APP_EXE%" set "APP_EXE=%ROOT%dist\TradingJournalProfileIsolation\TradingJournal.exe"

git -C "%ROOT%" rev-parse --show-toplevel >nul 2>nul
if errorlevel 1 goto launch

for /f "delims=" %%U in ('git -C "%ROOT%" remote get-url origin 2^>nul') do set "REMOTE=%%U"
if not "%REMOTE%"=="https://github.com/c01d43am/Trading-Journal.git" goto launch

for /f "delims=" %%B in ('git -C "%ROOT%" branch --show-current 2^>nul') do set "BRANCH=%%B"
if not "%BRANCH%"=="main" (
  echo Current branch is not main. Update skipped.
  goto launch
)

set "DIRTY="
for /f "delims=" %%S in ('git -C "%ROOT%" status --porcelain 2^>nul') do set "DIRTY=1"
if defined DIRTY (
  echo Local changes found. Update skipped to protect your files.
  goto launch
)

echo Checking for Trading Journal updates...
git -C "%ROOT%" fetch --quiet origin main
if errorlevel 1 (
  echo Update check failed. Starting the installed app.
  goto launch
)

git -C "%ROOT%" merge-base --is-ancestor HEAD FETCH_HEAD
if errorlevel 1 (
  echo Local branch has diverged. Update skipped.
  goto launch
)

git -C "%ROOT%" merge --ff-only FETCH_HEAD
if errorlevel 1 (
  echo Update could not be applied. Starting the installed app.
  goto launch
)

for /f "delims=" %%C in ('git -C "%ROOT%" rev-parse HEAD 2^>nul') do set "SOURCE_COMMIT=%%C"
set "AUTO_DIST=%LOCALAPPDATA%\TradingJournal\launcher-builds-v3-%SOURCE_COMMIT%"
set "APP_EXE=%AUTO_DIST%\TradingJournalProfileIsolationHeaderAlert\TradingJournal.exe"
set "BUILT_COMMIT="
if exist "%AUTO_DIST%\TradingJournalProfileIsolationHeaderAlert\.source-commit" (
  set /p BUILT_COMMIT=<"%AUTO_DIST%\TradingJournalProfileIsolationHeaderAlert\.source-commit"
)
if "%SOURCE_COMMIT%"=="%BUILT_COMMIT%" goto launch

echo Installing build dependencies and rebuilding the updated app...
call "%ROOT%required\build_windows.bat" "%AUTO_DIST%"
if errorlevel 1 (
  echo Rebuild failed. The app was not started; review the error above.
  pause
  exit /b 1
)
set "APP_EXE=%AUTO_DIST%\TradingJournalProfileIsolationHeaderAlert\TradingJournal.exe"

:launch
if not exist "%APP_EXE%" (
  echo Trading Journal app was not found or could not be built:
  echo "%APP_EXE%"
  pause
  exit /b 1
)

start "" "%APP_EXE%"
exit /b
