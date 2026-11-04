# Trading Journal

A private, local-first trading journal. Flask serves the web interface on `127.0.0.1`; an optional pywebview window can display the same local app. Each profile has its own trades, settings, images, and ZIP backups.

The repository launcher checks for safe updates in Command Prompt, rebuilds the packaged executable when its source changes, starts it as a separate process, then closes. The executable prompts you to choose one view: Web GUI or desktop app. Git is required for updates; local changes or a diverged branch prevent an automatic fast-forward.

## Run on Windows

1. Install Python 3.10 or later.
2. In PowerShell, from the `TradingJournal` folder:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install -r requirements.txt
   python app.py
   ```

The app opens `http://127.0.0.1:5000` in your browser. To select a different local port or suppress automatic browser launch:

```powershell
python app.py --port 5050
python app.py --no-browser
```

The launcher beside the `TradingJournal` folder asks whether to open the browser GUI or desktop window. It opens only the view you choose. You can also start a specific view from the application folder with `python app.py --web` or `python app.py --desktop`.

## Data, backups, and restore

- Data is stored in `%APPDATA%\TradingJournal\data\` for both source and packaged launches, so profile data remains available when switching between them.
- Existing source data in `required\data\` is imported into the shared data folder on first launch; the original files are kept unchanged.
- The profile list is stored in `backtesting_profiles.json`; each profile's `trades.json`, `config.json`, and `images/` are stored in a separate folder under `profiles/`. Existing shared journal data is assigned once to the profile that was active before the first profile-specific launch; it is not copied into every profile, and the original shared files are left untouched.
- Local ZIP backups contain only the selected profile's journal data. By default, backups are saved with that profile's data; choose another folder in **Settings → Local backup folder**.
- Profile setup requires a mode and only shows that mode's required fields: pair/date range/capital for backtesting, firm/risk limits/target/phase for prop firms, or broker name/capital for brokers.
- New profiles require a password, 6–12 digit PIN, or passcode. The launcher app stores a salted scrypt hash, asks for the code on each profile open, and requires typing the profile name to delete a profile when its code is forgotten. Codes cannot be recovered. Journal files remain local data and are not encrypted by the profile code.
- The profile picker and mode-specific mock dashboard use the same local web interface in both browser and desktop views.
- Saved profiles open in read-only view mode. Use **Edit profile** to update a profile; **Cancel** discards edits, and **Save Updates** validates and saves the selected mode's fields.
- Each profile keeps one automatic local backup, refreshed at most once every 30 days while the app is open or when it closes. You can also create a manual ZIP backup in **Settings → Create manual backup**.
- A restore validates the archive and creates a safety backup before replacing current trades, settings, and images.
- Google OAuth tokens are stored separately and excluded from backups.

Older desktop journal data, if present in `%LOCALAPPDATA%\TradingJournal\journal.sqlite3`, is migrated on first startup. The old database is left untouched.

## Optional Google Drive sync

Google Drive sync is off by default. Install the requirements, enable the Drive toggle in Settings, and place your Google OAuth **Desktop app** client JSON file at `credentials.json` beside the app. In Google Cloud Console, enable the Drive API and configure OAuth consent. Choose **Sign in with Google** once, then use **Sync now** or **Restore Drive backup**. The app requests the `drive.file` scope and stores the resulting token in its data folder. Never share OAuth credentials or tokens.

Drive sync uses a localhost OAuth callback on port 5001. If that port is in use, close the other app using it and retry sign-in.

## Single-file Windows executable

With Python 3 available on Windows, build the app:

```powershell
.\build_windows.bat
```

The build script creates a project-local `.venv` and installs the required packages there.

The launcher updates a clean checkout from the trusted `origin/main`, installs build dependencies in a project-local `.venv` when needed, and rebuilds the packaged executable under `%LOCALAPPDATA%\TradingJournal\launcher-builds-v9-<commit>\` whenever its source commit changes. If Git metadata is unavailable, it falls back to an existing executable in `dist\`. Local changes or a diverged branch are never overwritten or rebuilt automatically. Journal data remains separately in `%APPDATA%\TradingJournal\data\` so source updates do not erase it. Desktop mode requires Microsoft Edge WebView2 and .NET Framework 4.8 and serves the same local UI as browser mode.

## Trade calculations

If P&L is blank, it is calculated as `(exit - entry) × size` for Long and reversed for Short. Enter P&L manually to account for commissions or contract multipliers. R-multiple is `P&L ÷ (|entry - stop| × size)`. These calculations assume the entered price and size units are compatible.

## Tests

```powershell
py -m unittest discover -s tests -v
```
