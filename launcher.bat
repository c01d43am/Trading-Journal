@echo off
setlocal
set "ROOT=%~dp0"
if not defined LOCALAPPDATA set "LOCALAPPDATA=%USERPROFILE%\AppData\Local"
set "AUTO_DIST=%LOCALAPPDATA%\TradingJournal\launcher-builds-local"
set "SOURCE_COMMIT="
for /f "delims=" %%C in ('git -C "%ROOT%" rev-parse HEAD 2^>nul') do set "SOURCE_COMMIT=%%C"
if defined SOURCE_COMMIT set "AUTO_DIST=%LOCALAPPDATA%\TradingJournal\launcher-builds-v10-%SOURCE_COMMIT%"
set "APP_EXE=%AUTO_DIST%\TradingJournalProfileIsolationHeaderAlert\TradingJournal.exe"

git -C "%ROOT%" rev-parse --show-toplevel >nul 2>nul
if errorlevel 1 goto build_current

for /f "delims=" %%U in ('git -C "%ROOT%" remote get-url origin 2^>nul') do set "REMOTE=%%U"
if not "%REMOTE%"=="https://github.com/c01d43am/Trading-Journal.git" goto build_current

for /f "delims=" %%B in ('git -C "%ROOT%" branch --show-current 2^>nul') do set "BRANCH=%%B"
if not "%BRANCH%"=="main" (
  echo Current branch is not main. Repository update skipped.
  goto build_current
)

set "DIRTY="
for /f "delims=" %%S in ('git -C "%ROOT%" status --porcelain 2^>nul') do set "DIRTY=1"
if defined DIRTY (
  echo Local changes found. Repository update skipped to protect your files.
  goto build_current
)

echo Checking for Trading Journal updates...
git -C "%ROOT%" fetch --quiet origin main
if errorlevel 1 (
  echo Update check failed. Starting the current local version.
  goto build_current
)

git -C "%ROOT%" merge-base --is-ancestor HEAD FETCH_HEAD
if errorlevel 1 (
  echo Local branch has diverged. Repository update skipped.
  goto build_current
)

git -C "%ROOT%" merge --ff-only FETCH_HEAD
if errorlevel 1 (
  echo Update could not be applied. Starting the current local version.
  goto build_current
)

:build_current
for /f "delims=" %%C in ('git -C "%ROOT%" rev-parse HEAD 2^>nul') do set "SOURCE_COMMIT=%%C"
set "AUTO_DIST=%LOCALAPPDATA%\TradingJournal\launcher-builds-local"
if defined SOURCE_COMMIT set "AUTO_DIST=%LOCALAPPDATA%\TradingJournal\launcher-builds-v10-%SOURCE_COMMIT%"
set "APP_EXE=%AUTO_DIST%\TradingJournalProfileIsolationHeaderAlert\TradingJournal.exe"
set "SOURCE_DIRTY="
for /f "delims=" %%S in ('git -C "%ROOT%" status --porcelain -- required web 2^>nul') do set "SOURCE_DIRTY=1"
if defined SOURCE_DIRTY goto rebuild_app
set "BUILT_COMMIT="
if exist "%AUTO_DIST%\TradingJournalProfileIsolationHeaderAlert\.source-commit" (
  set /p BUILT_COMMIT=<"%AUTO_DIST%\TradingJournalProfileIsolationHeaderAlert\.source-commit"
)
if not defined SOURCE_COMMIT goto rebuild_app
if not "%SOURCE_COMMIT%"=="%BUILT_COMMIT%" goto rebuild_app
if not exist "%APP_EXE%" goto rebuild_app
goto launch

:rebuild_app
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
