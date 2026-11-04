@echo off
setlocal
set "APP_EXE=%~dp0dist\TradingJournalProfileIsolation\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0dist\journal-driven\TradingJournalProfileIsolation\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0dist\profile-metrics\TradingJournalProfileIsolation\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0TradingJournal\dist\TradingJournalProfileIsolation\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0dist\staging\TradingJournalProfileIsolation\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0TradingJournal\dist\TradingJournalProfileTypes\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0dist\TradingJournalProfileTypes\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0TradingJournal\dist\TradingJournalProfileChooser\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0dist\TradingJournalProfileChooser\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0TradingJournal\dist\TradingJournalProfileRefresh\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0dist\TradingJournalProfileRefresh\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0TradingJournal\dist\TradingJournalProfiles\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0dist\TradingJournalProfiles\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0TradingJournal\dist\TradingJournalPairMenu\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0dist\TradingJournalPairMenu\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0TradingJournal\dist\TradingJournalPnl\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0dist\TradingJournalPnl\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0TradingJournal\dist\TradingJournalWeekly\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0dist\TradingJournalWeekly\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0TradingJournal\dist\TradingJournalDataFix\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0dist\TradingJournalDataFix\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0TradingJournal\dist\TradingJournalApp\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0dist\TradingJournalApp\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0TradingJournal\dist\TradingJournal\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0dist\TradingJournal\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

set "APP_EXE=%~dp0required\dist\TradingJournal\TradingJournal.exe"
if exist "%APP_EXE%" goto launch

echo Trading Journal app was not found.
echo Checked the TradingJournal, dist, and required folders beside this launcher.
echo Run the app's build_windows.bat first.
pause
exit /b 1

:launch
start "" "%APP_EXE%"
