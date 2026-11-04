# Trading Journal

A local-first trading journal for recording trades, reviewing performance, and keeping data organized by profile. The main application uses Flask for its local web server and can also open in an optional desktop window.

## Features

- Separate profiles for backtesting, prop-firm, and broker workflows.
- Trade journal with notes, custom fields, and image attachments.
- Automatic P&L and R-multiple calculations when P&L is not entered manually.
- Trade history, charts, calendar, and profile-specific settings.
- Local ZIP backups, validated restore with a safety backup, and optional Google Drive sync.
- Local-only server; the journal is intended to be accessed from this computer.
- New profiles can be protected with a password, PIN, or passcode; profile codes are stored as salted hashes, not reversible encrypted text.

## Run on Windows

From the repository root, create a virtual environment and install the Python dependencies:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r required\requirements.txt
python required\app.py
```

The app opens `http://127.0.0.1:5000` in your browser. Useful options:

```powershell
python required\app.py --port 5050
python required\app.py --no-browser
python required\app.py --desktop
python required\app.py --choose
```

The desktop view requires Microsoft Edge WebView2 and .NET Framework 4.8. On Windows, `required\run.bat` starts the view chooser. The desktop window and browser both use the same local web UI; desktop mode runs the local server on a background thread in the app process. `launcher.bat` checks for safe updates in Command Prompt, rebuilds the packaged app when its source changes, starts it as a separate process, then closes.

`launcher.bat` updates a clean checkout from the trusted `origin/main` using a fast-forward only, then launches its rebuilt executable from `%LOCALAPPDATA%\TradingJournal\launcher-builds-v10-<commit>\`. It installs build dependencies in a project-local `.venv` and rebuilds the executable whenever the source commit changes or local app/UI sources are modified. Local changes are not overwritten.

## Data and privacy

Application data is stored in `%APPDATA%\TradingJournal\data\`, separately from the source code and packaged application. Profiles have separate trades, settings, images, and backups. Existing legacy data is migrated without deleting the original files.

Automatic backups keep one rotating ZIP per profile and refresh it no more than once every 30 days. Manual backups are available in Settings.

Google Drive sync is optional and disabled by default. To enable it, configure a Google OAuth **Desktop app** client, place its client JSON at `credentials.json` beside the application, enable Drive sync in Settings, and sign in. OAuth credentials and tokens are private: do not commit or share them.

This is a local journaling tool, not a broker or a source of financial advice. Protect your data with backups and do not treat recorded or calculated performance as a guarantee of future results.

## Build a Windows executable

With Python 3 available on Windows, run:

```powershell
.\required\build_windows.bat
```

The build output is placed under `dist\TradingJournalProfileIsolationHeaderAlert\`. The app continues to store journal data in `%APPDATA%\TradingJournal\data\`, so rebuilding or replacing the executable does not replace the journal data.
The build script creates a project-local `.venv` and installs the required packages there.

The launcher rebuilds the packaged executable after safely updating repository files, so source changes are included the next time it starts. Automatic builds stay outside the Git checkout; manual builds go to `dist\`. Build dependencies are installed into a project-local `.venv`; journal data remains separately in `%APPDATA%\TradingJournal\data\`.

## Tests

Run the Python test suite from the repository root:

```powershell
py -m unittest discover -s tests -v
```

## Project layout

- `required\` — Flask application, data/backend logic, desktop wrapper, and Windows build scripts.
- `web\` — browser interface served by the main application.
- `tests\` — Python tests.
- `Market Data\` — market symbol lists and related utilities.
- `dashboard-app\` — separate React, TypeScript, and Vite dashboard prototype; see its [README](dashboard-app/README.md) for setup.
- `data\` — repository-level application data/configuration.
- `dist\` and `build\` — generated packaging output.
