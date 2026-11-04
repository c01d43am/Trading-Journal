#define AppName "Trading Journal"
#define AppVersion "1.0.0"

[Setup]
AppId={{BAE083C3-5EEB-42CC-B906-0BCF4CC20DC4}
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={localappdata}\TradingJournal
DefaultGroupName={#AppName}
OutputDir=dist
OutputBaseFilename=TradingJournal-Setup
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\TradingJournal.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Files]
Source: "dist\TradingJournalCurrent\TradingJournalWeb\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Trading Journal (Web)"; Filename: "{app}\TradingJournal.exe"
Name: "{autodesktop}\Trading Journal"; Filename: "{app}\TradingJournal.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Run]
Filename: "{app}\TradingJournal.exe"; Description: "Launch Trading Journal"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Journal data is stored in the user's AppData folder and is intentionally preserved.
