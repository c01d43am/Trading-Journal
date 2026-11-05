# Trading Journal

A local-first trading journal for recording trades, reviewing performance, and keeping data organized by profile. The application runs its local web server and opens the dashboard in your browser.

## Features

- Separate profiles for backtesting, prop-firm, and broker workflows.
- Trade journal with notes, custom fields, and image attachments.
- Automatic P&L and R-multiple calculations when P&L is not entered manually.
- Trade history, charts, calendar, and profile-specific settings.
- Local ZIP backups, validated restore with a safety backup, JSON trade import that merges without replacing existing trades, and optional Google Drive sync.
- Local-only server; the journal is intended to be accessed from this computer.

## Run on Windows

From the repository root, create a virtual environment and install the Python dependencies:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r required\requirements.txt
python required\app.py
```

The app chooses any available local port and opens it in your browser. Useful options:

```powershell
python required\app.py --port 5050
python required\app.py --no-browser
```

On Windows, `launcher.bat` builds and opens the current React dashboard with a windowless Python runtime when available, rather than starting an older packaged interface. This requires Node.js/npm and the dashboard dependencies installed in `dashboard-app`; if Python is unavailable, the launcher uses the packaged executable. The Flask server selects an available local port, and direct dashboard URLs continue to work after refresh.

## Data and privacy

Application data is stored in `%APPDATA%\TradingJournal\data\`, separately from the source code and packaged application. Profiles have separate trades, settings, images, and backups. Existing legacy data is migrated without deleting the original files.

To add trades from a `trades.json` file, open **Settings → Import trades JSON** in the dashboard. The app creates a safety backup, adds valid trades to the selected profile, and skips duplicate IDs. JSON imports do not include image files.

Google Drive sync is optional and disabled by default. To enable it, configure a Google OAuth **Desktop app** client, place its client JSON at `credentials.json` beside the application, enable Drive sync in Settings, and sign in. OAuth credentials and tokens are private: do not commit or share them.

This is a local journaling tool, not a broker or a source of financial advice. Protect your data with backups and do not treat recorded or calculated performance as a guarantee of future results.

## Build a Windows executable

With the Python dependencies installed on Windows, run:

```powershell
.\required\build_windows.bat
```

The build output is placed under `dist\`. The app continues to store journal data in `%APPDATA%\TradingJournal\data\`, so rebuilding or replacing the executable does not replace the journal data.

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
- `dashboard-app\` — React, TypeScript, and Vite dashboard served by the Windows launcher; see its [README](dashboard-app/README.md) for setup.
- `data\` — repository-level application data/configuration.
- `dist\` and `build\` — generated packaging output.
