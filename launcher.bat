@echo off
setlocal
set "APP_EXE=%~dp0dist\TradingJournalProfileIsolationUpdateStatus\TradingJournal.exe"
if not exist "%APP_EXE%" set "APP_EXE=%~dp0dist\TradingJournalProfileIsolationNetFx\TradingJournal.exe"
if not exist "%APP_EXE%" set "APP_EXE=%~dp0dist\TradingJournalProfileIsolation\TradingJournal.exe"

if not exist "%APP_EXE%" (
  echo Trading Journal app was not found:
  echo "%APP_EXE%"
  pause
  exit /b 1
)

git -C "%~dp0" rev-parse --show-toplevel >nul 2>nul
if errorlevel 1 (
  echo Git checkout not detected. Starting the installed app without updating.
  goto launch
)

for /f "delims=" %%U in ('git -C "%~dp0" remote get-url origin 2^>nul') do set "REMOTE=%%U"
if not "%REMOTE%"=="https://github.com/c01d43am/Trading-Journal.git" goto launch

for /f "delims=" %%B in ('git -C "%~dp0" branch --show-current 2^>nul') do set "BRANCH=%%B"
if not "%BRANCH%"=="main" (
  echo Current branch is not main. Update skipped.
  goto launch
)

set "DIRTY="
for /f "delims=" %%S in ('git -C "%~dp0" status --porcelain 2^>nul') do set "DIRTY=1"
if defined DIRTY (
  echo Local changes found. Update skipped to protect your files.
  goto launch
)

echo Checking for Trading Journal updates...
git -C "%~dp0" fetch --quiet origin main
if errorlevel 1 (
  echo Update check failed. Starting the installed app.
  goto launch
)

git -C "%~dp0" merge-base --is-ancestor HEAD FETCH_HEAD
if errorlevel 1 (
  echo Local branch has diverged. Update skipped.
  goto launch
)

git -C "%~dp0" merge --ff-only FETCH_HEAD
if errorlevel 1 echo Update could not be applied. Starting the installed app.

:launch
start "" "%APP_EXE%"
exit /b
