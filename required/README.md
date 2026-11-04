# Trading Journal

A private, local-first trading journal. Flask serves the web interface on `127.0.0.1` and opens it in your browser. Each profile has its own trades, settings, images, and ZIP backups.

The `launcher.bat` file runs the current Python source when available and uses the latest packaged build as a fallback.

## Run on Windows

1. Install Python 3.10 or later.
2. In PowerShell, from the `TradingJournal` folder:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install -r requirements.txt
   python app.py
   ```

The app opens `http://127.0.0.1:5007` in your browser. To select a different local port or suppress automatic browser launch:

```powershell
python app.py --port 5050
python app.py --no-browser
```

Run `launcher.bat` to open the web dashboard. The launcher and Python entry point use the same local journal data and dashboard features.

## Data, backups, and restore

- Data is stored in `%APPDATA%\TradingJournal\data\` for both source and packaged launches, so profile data remains available when switching between them.
- Existing source data in `required\data\` is imported into the shared data folder on first launch; the original files are kept unchanged.
- The profile list is stored in `backtesting_profiles.json`; each profile's `trades.json`, `config.json`, and `images/` are stored in a separate folder under `profiles/`. Existing shared journal data is assigned once to the profile that was active before the first profile-specific launch; it is not copied into every profile, and the original shared files are left untouched.
- Local ZIP backups contain only the selected profile's journal data. By default, backups are saved with that profile's data; choose another folder in **Settings → Local backup folder**.
- Profile setup requires a mode and only shows that mode's required fields: pair/date range/capital for backtesting, firm/risk limits/target/phase for prop firms, or broker name/capital for brokers.
- The profile picker and mode-specific dashboard use the same local web interface.
- Saved profiles open in read-only view mode. Use **Edit profile** to update a profile; **Cancel** discards edits, and **Save Updates** validates and saves the selected mode's fields.
- Each profile's automatic local backup is refreshed at most once per week when the app closes; scheduled backups also rotate that profile's weekly ZIP. You can make additional timestamped backups with **Settings → Backup now**.
- A restore validates the archive and creates a safety backup before replacing current trades, settings, and images.
- Google OAuth tokens are stored separately and excluded from backups.

Older desktop journal data, if present in `%LOCALAPPDATA%\TradingJournal\journal.sqlite3`, is migrated on first startup. The old database is left untouched.

## Optional Google Drive sync

Google Drive sync is off by default. Install the requirements, enable the Drive toggle in Settings, and place your Google OAuth **Desktop app** client JSON file at `credentials.json` beside the app. In Google Cloud Console, enable the Drive API and configure OAuth consent. Choose **Sign in with Google** once, then use **Sync now** or **Restore Drive backup**. The app requests the `drive.file` scope and stores the resulting token in its data folder. Never share OAuth credentials or tokens.

Drive sync uses a localhost OAuth callback on port 5001. If that port is in use, close the other app using it and retry sign-in.

## Single-file Windows executable

Install the requirements on Windows, then build the app:

```powershell
.\build_windows.bat
```

Run `dist\TradingJournalCurrent\TradingJournalWeb\TradingJournal.exe` to open the web dashboard, or use `launcher.bat`. On startup, select a saved profile or create one by choosing Backtesting, Prop Firm, or Broker and filling all required fields for that mode. Journal data remains separately in `%APPDATA%\TradingJournal\data\` so updates do not erase it.

## Trade calculations

If P&L is blank, it is calculated as `(exit - entry) × size` for Long and reversed for Short. Enter P&L manually to account for commissions or contract multipliers. R-multiple is `P&L ÷ (|entry - stop| × size)`. These calculations assume the entered price and size units are compatible.

## Tests

```powershell
py -m unittest discover -s tests -v
```
