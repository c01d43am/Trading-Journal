import argparse
import os
import secrets
import subprocess
import sys
import tempfile
import threading
import time
import webbrowser
import zipfile
from pathlib import Path

from flask import Flask, jsonify, request, send_file, send_from_directory
from werkzeug.exceptions import RequestEntityTooLarge

from backend import (
    APP_ROOT,
    JournalBackend,
    register_exit_backup,
    start_backup_scheduler,
)

UPDATE_REMOTE_URL = "https://github.com/c01d43am/Trading-Journal.git"
UPDATE_LOCK = threading.Lock()


def public_profiles(state: dict) -> dict:
    profiles = []
    for profile in state["profiles"]:
        public = {
            key: value
            for key, value in profile.items()
            if key != "access_hash"
        }
        if profile.get("access_hash"):
            public["access_configured"] = True
        profiles.append(public)
    return {"profiles": profiles, "active_profile_id": state["active_profile_id"]}


def create_app(data_dir: Path | None = None, *, register_shutdown: bool = False) -> Flask:
    web_dir = APP_ROOT / "web"
    app = Flask(__name__, static_folder=str(web_dir), static_url_path="")
    app.config["MAX_CONTENT_LENGTH"] = 250 * 1024 * 1024
    backend = JournalBackend(data_dir)
    profile_backends: dict[str, JournalBackend] = {}
    profile_backends_lock = threading.Lock()
    profile_access_sessions: dict[str, str] = {}
    profile_access_failures: dict[str, tuple[int, float]] = {}
    app.extensions["profile_access_sessions"] = profile_access_sessions
    app.extensions["profile_access_failures"] = profile_access_failures
    app.extensions["journal_backend"] = backend
    if register_shutdown:
        register_exit_backup(backend)
        start_backup_scheduler(backend)

    def journal_backend_for_request(profile_id: str | None = None) -> JournalBackend:
        profiles_state = backend.load_backtesting_profiles()
        selected_id = profile_id or request.headers.get("X-Trading-Profile-ID")
        if selected_id is None:
            selected_id = profiles_state["active_profile_id"]
        if not selected_id:
            if profiles_state["profiles"]:
                raise ValueError("Choose a saved profile before opening its journal.")
            return backend
        if selected_id not in {profile["id"] for profile in profiles_state["profiles"]}:
            raise ValueError("Choose a saved profile before opening its journal.")
        backend.prepare_profile_data(selected_id)
        with profile_backends_lock:
            if selected_id not in profile_backends:
                profile_backends[selected_id] = backend.for_profile(selected_id)
            return profile_backends[selected_id]

    @app.before_request
    def restrict_to_loopback():
        if request.remote_addr not in ("127.0.0.1", "::1", None):
            return jsonify(error="This journal only accepts local connections."), 403
        hostname = request.host.split(":", 1)[0].strip("[]").lower()
        if hostname not in ("127.0.0.1", "localhost", "::1"):
            return jsonify(error="This journal only accepts localhost requests."), 403
        origin = request.headers.get("Origin")
        if origin:
            from urllib.parse import urlparse

            if urlparse(origin).hostname not in ("127.0.0.1", "localhost", "::1"):
                return jsonify(error="Cross-origin requests are not allowed."), 403
        return None

    @app.before_request
    def require_profile_access():
        if not request.path.startswith("/api/"):
            return None
        if request.path in {"/api/mode", "/api/update/check"} or (
            request.path == "/api/backtesting-profiles"
            and request.method in {"GET", "POST"}
        ):
            return None
        if request.path.startswith("/api/profile-access/"):
            return None
        profiles_state = backend.load_backtesting_profiles()
        requested_profile_id = None
        if request.path.startswith("/api/images/") or request.path == "/api/download":
            requested_profile_id = request.args.get("profile_id")
        profile_id = (
            requested_profile_id
            or request.headers.get("X-Trading-Profile-ID")
            or profiles_state["active_profile_id"]
        )
        profile = next(
            (item for item in profiles_state["profiles"] if item["id"] == profile_id),
            None,
        )
        if not profile:
            return None
        token = request.headers.get("X-Profile-Access-Token") or request.cookies.get(
            "profile_access_token", ""
        )
        if not profile.get("access_hash"):
            return jsonify(error="Set a profile access code before accessing its journal."), 401
        if (
            profile_id != profiles_state["active_profile_id"]
            or profile_access_sessions.get(token) != profile_id
        ):
            return jsonify(error="Unlock this profile before accessing its journal."), 401
        return None

    @app.errorhandler(RequestEntityTooLarge)
    def handle_large_request(error):
        del error
        return jsonify(error="The uploaded file exceeds the 250 MB limit."), 413

    @app.errorhandler(ValueError)
    def handle_invalid_request(error):
        return jsonify(error=str(error)), 400

    @app.errorhandler(FileNotFoundError)
    def handle_missing_file(error):
        return jsonify(error=str(error)), 404

    @app.errorhandler(zipfile.BadZipFile)
    def handle_invalid_zip(error):
        del error
        return jsonify(error="The uploaded backup is not a valid ZIP file."), 400

    @app.get("/")
    def index():
        return send_from_directory(str(web_dir), "index.html")

    @app.get("/api/mode")
    def mode():
        return jsonify(mode=os.environ.get("TJ_MODE", "web"))

    @app.post("/api/update/check")
    def update_check():
        if getattr(sys, "frozen", False):
            return jsonify(
                status="launcher_managed",
                message=(
                    "Start the app with launcher.bat. It checks the trusted repository "
                    "and rebuilds the packaged app when updates are available."
                ),
            )
        if not UPDATE_LOCK.acquire(blocking=False):
            return jsonify(error="An update check is already running."), 409
        try:
            root = APP_ROOT.resolve()
            commands = [
                (["git", "rev-parse", "--show-toplevel"], "Could not locate the source checkout."),
                (["git", "remote", "get-url", "origin"], "Could not verify the update source."),
                (["git", "branch", "--show-current"], "Could not verify the current branch."),
            ]
            results = []
            for command, error_message in commands:
                try:
                    result = subprocess.run(
                        command,
                        cwd=root,
                        capture_output=True,
                        text=True,
                        timeout=15,
                        check=False,
                    )
                except (OSError, subprocess.TimeoutExpired) as error:
                    return jsonify(error=f"{error_message} {error}"), 503
                if result.returncode:
                    return jsonify(error=f"{error_message} {result.stderr.strip()}"), 503
                results.append(result.stdout.strip())

            checkout, remote, branch = results
            if Path(checkout).resolve() != root:
                return jsonify(error="The app is not running from the repository root."), 409
            if remote != UPDATE_REMOTE_URL:
                return jsonify(error="The configured Git remote is not the trusted project repository."), 409
            if branch != "main":
                return jsonify(error="Automatic updates are limited to the main branch."), 409

            try:
                fetched = subprocess.run(
                    ["git", "fetch", "--quiet", "origin", "main"],
                    cwd=root,
                    capture_output=True,
                    text=True,
                    timeout=60,
                    check=False,
                )
            except (OSError, subprocess.TimeoutExpired) as error:
                return jsonify(error=f"Could not check the repository for updates: {error}"), 503
            if fetched.returncode:
                return jsonify(
                    error=f"Could not check the repository for updates: {fetched.stderr.strip()}"
                ), 503

            ancestor = subprocess.run(
                ["git", "merge-base", "--is-ancestor", "HEAD", "FETCH_HEAD"],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=15,
                check=False,
            )
            if ancestor.returncode not in (0, 1):
                return jsonify(error="Could not compare the local and remote versions."), 503
            if ancestor.returncode == 1:
                return jsonify(error="The local branch has diverged from origin/main; automatic update was skipped."), 409

            behind = subprocess.run(
                ["git", "rev-list", "--count", "HEAD..FETCH_HEAD"],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=15,
                check=False,
            )
            if behind.returncode:
                return jsonify(error="Could not compare the local and remote versions."), 503
            try:
                commits_behind = int(behind.stdout.strip())
            except ValueError:
                return jsonify(error="The repository returned an invalid update count."), 503
            if commits_behind == 0:
                return jsonify(status="current", message="Trading Journal is up to date.")

            working_tree = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=15,
                check=False,
            )
            if working_tree.returncode:
                return jsonify(error="Could not check local changes before updating."), 503
            if working_tree.stdout.strip():
                return jsonify(
                    error="An update is available, but local source changes must be saved before it can be applied."
                ), 409

            merged = subprocess.run(
                ["git", "merge", "--ff-only", "FETCH_HEAD"],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=60,
                check=False,
            )
            if merged.returncode:
                return jsonify(
                    error=f"Could not apply the update: {merged.stderr.strip() or merged.stdout.strip()}"
                ), 503
            if not app.testing:
                threading.Timer(2.5, restart_updated_application).start()
            return jsonify(
                status="updated",
                message=f"Installed {commits_behind} update(s). Restarting Trading Journal…",
                restart_in_ms=2500,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            return jsonify(error=f"Automatic update failed: {error}"), 503
        finally:
            UPDATE_LOCK.release()

    @app.get("/api/trades")
    def list_trades():
        return jsonify(journal_backend_for_request().load_trades())

    @app.get("/api/backtesting-profiles")
    def list_backtesting_profiles():
        return jsonify(public_profiles(backend.load_backtesting_profiles()))

    @app.post("/api/backtesting-profiles")
    def update_backtesting_profiles():
        previous = backend.load_backtesting_profiles()
        previous_by_id = {profile["id"]: profile for profile in previous["profiles"]}
        submitted = request.get_json(silent=False)
        if not isinstance(submitted, dict) or not isinstance(submitted.get("profiles"), list):
            raise ValueError("Backtesting profiles must contain a profile list.")
        submitted_ids = {
            str(profile.get("id"))
            for profile in submitted["profiles"]
            if isinstance(profile, dict)
        }
        if set(previous_by_id) - submitted_ids:
            raise ValueError("Use the profile delete action to permanently remove a profile.")
        active_id = previous.get("active_profile_id")
        requested_active_id = submitted.get("active_profile_id")
        if (
            active_id
            and requested_active_id != active_id
            and any(
                item["id"] == requested_active_id and item.get("access_hash")
                for item in previous["profiles"]
            )
        ):
            raise ValueError("Unlock the profile you want to open.")
        existing_by_id = {profile["id"]: profile for profile in submitted["profiles"]}
        for profile_id in set(previous_by_id) & set(existing_by_id):
            if existing_by_id[profile_id].get("access_code") is not None:
                return jsonify(error="Use the profile access screen to set or unlock a profile code."), 400
        changed_existing = []
        for profile_id, old_profile in previous_by_id.items():
            new_profile = existing_by_id[profile_id]
            old_public = {key: value for key, value in old_profile.items() if key != "access_hash"}
            new_public = {
                key: value
                for key, value in new_profile.items()
                if key != "access_configured"
            }
            if old_public != new_public:
                changed_existing.append(profile_id)
        token = request.headers.get("X-Profile-Access-Token", "")
        for changed_id in changed_existing:
            if (
                changed_id != active_id
                or profile_access_sessions.get(token) != changed_id
            ):
                return jsonify(error="Unlock this profile before changing its settings."), 401
        profiles = backend.save_backtesting_profiles(submitted)
        return jsonify(public_profiles(profiles))

    @app.post("/api/profile-access/<profile_id>")
    def profile_access(profile_id: str):
        body = request.get_json(silent=False)
        if not isinstance(body, dict):
            raise ValueError("Profile access request must be an object.")
        state = backend.load_backtesting_profiles()
        profile = next((item for item in state["profiles"] if item["id"] == profile_id), None)
        if profile is None:
            raise ValueError("Choose a saved profile.")

        action = body.get("action")
        if action == "delete":
            if body.get("confirm_name") != profile["name"]:
                raise ValueError("Type the profile name exactly to confirm deletion.")
            clear_access_cookie = (
                profile_access_sessions.get(
                    request.cookies.get("profile_access_token", "")
                )
                == profile_id
            )
            state["profiles"] = [item for item in state["profiles"] if item["id"] != profile_id]
            if state["active_profile_id"] == profile_id:
                state["active_profile_id"] = None
            saved = backend.save_backtesting_profiles(state)
            with profile_backends_lock:
                profile_backends.pop(profile_id, None)
            sessions = app.extensions["profile_access_sessions"]
            for token, unlocked_id in list(sessions.items()):
                if unlocked_id == profile_id:
                    del sessions[token]
            app.extensions["profile_access_failures"].pop(profile_id, None)
            response = jsonify(public_profiles(saved))
            if clear_access_cookie:
                response.delete_cookie("profile_access_token", path="/")
            return response

        code = body.get("code")
        if action == "setup":
            saved = backend.set_profile_access(profile_id, body.get("method"), code)
            state = saved
            profile = next(item for item in state["profiles"] if item["id"] == profile_id)
        elif action == "unlock":
            if not profile.get("access_hash"):
                return jsonify(error="Set an access code to protect this profile."), 409
            failures = app.extensions["profile_access_failures"]
            attempts, blocked_until = failures.get(profile_id, (0, 0.0))
            now = time.monotonic()
            if now < blocked_until:
                return jsonify(error="Too many incorrect codes. Wait 30 seconds and try again."), 429
            if not isinstance(code, str) or not backend.verify_profile_access(profile_id, code):
                attempts += 1
                failures[profile_id] = (
                    0 if attempts >= 5 else attempts,
                    now + 30 if attempts >= 5 else 0.0,
                )
                return jsonify(error="The profile access code is incorrect."), 401
            failures.pop(profile_id, None)
        else:
            raise ValueError("Choose setup, unlock, or delete.")

        for token, unlocked_id in list(profile_access_sessions.items()):
            if unlocked_id != profile_id:
                del profile_access_sessions[token]
        state["active_profile_id"] = profile_id
        backend.save_backtesting_profiles(state)
        token = secrets.token_urlsafe(32)
        profile_access_sessions[token] = profile_id
        response = jsonify(
            profiles=public_profiles(state),
            access_token=token,
            profile_id=profile_id,
        )
        response.set_cookie(
            "profile_access_token",
            token,
            httponly=True,
            samesite="Strict",
            path="/",
        )
        return response

    @app.post("/api/trades")
    def create_trade():
        trade_data = request.get_json(silent=False)
        profiles_state = backend.load_backtesting_profiles()
        selected_id = request.headers.get("X-Trading-Profile-ID") or profiles_state["active_profile_id"]
        selected_profile = next(
            (profile for profile in profiles_state["profiles"] if profile["id"] == selected_id),
            None,
        )
        if (
            selected_profile
            and selected_profile["type"] == "backtesting"
            and isinstance(selected_profile.get("backtesting"), dict)
        ):
            backtesting = selected_profile["backtesting"]
            trade_date = trade_data.get("date") if isinstance(trade_data, dict) else None
            if not isinstance(trade_date, str) or not (
                backtesting["date_from"] <= trade_date[:10] <= backtesting["date_to"]
            ):
                raise ValueError(
                    "Trade date must be within the backtesting profile date range "
                    f"({backtesting['date_from']} to {backtesting['date_to']})."
                )
        trade = journal_backend_for_request().save_trade(trade_data)
        return jsonify(trade), 201

    @app.delete("/api/trades/<trade_id>")
    def remove_trade(trade_id: str):
        journal_backend_for_request().delete_trade(trade_id)
        return jsonify(ok=True)

    @app.post("/api/upload_image")
    def upload_image():
        body = request.get_json(silent=False)
        if not isinstance(body, dict) or "image_base64" not in body:
            raise ValueError("Provide image_base64 in the JSON request.")
        return jsonify(ok=True, path=journal_backend_for_request().save_image(body["image_base64"]))

    @app.get("/api/images/<path:image_path>")
    def get_image(image_path: str):
        safe_path = journal_backend_for_request(
            request.args.get("profile_id")
        ).get_download(f"images/{image_path}")
        return send_file(safe_path, conditional=True)

    @app.get("/api/config")
    def get_config():
        return jsonify(journal_backend_for_request().load_config())

    @app.post("/api/config")
    def update_config():
        config = journal_backend_for_request().save_config(request.get_json(silent=False))
        return jsonify(config)

    @app.post("/api/backup-folder")
    def choose_backup_folder():
        import tkinter as tk
        from tkinter import filedialog

        journal = journal_backend_for_request()
        root = tk.Tk()
        root.withdraw()
        try:
            selected = filedialog.askdirectory(
                parent=root,
                initialdir=str(
                    journal.backups_dir
                    if journal.backups_dir.is_dir()
                    else journal.root
                ),
                mustexist=True,
                title="Choose local backup folder",
            )
        finally:
            root.destroy()
        return jsonify(path=selected or None)

    @app.post("/api/backup")
    def create_backup():
        journal = journal_backend_for_request()
        path = journal.create_backup()
        return jsonify(ok=True, path=f"backups/{path.name}")

    @app.post("/api/restore")
    def restore_backup():
        journal = journal_backend_for_request()
        uploaded = request.files.get("file")
        if not uploaded or not uploaded.filename:
            raise ValueError("Choose a backup ZIP file to restore.")
        if Path(uploaded.filename).suffix.lower() != ".zip":
            raise ValueError("The selected backup must be a ZIP file.")
        with tempfile.NamedTemporaryFile(prefix="trading-journal-upload-", suffix=".zip", delete=False) as temp_file:
            temporary_path = Path(temp_file.name)
            uploaded.save(temp_file)
        try:
            journal.restore_backup(temporary_path)
        finally:
            temporary_path.unlink(missing_ok=True)
        return jsonify(ok=True, trades=journal.load_trades(), config=journal.load_config())

    @app.get("/api/download")
    def download():
        journal = journal_backend_for_request(request.args.get("profile_id"))
        safe_path = journal.get_download(request.args.get("path", ""))
        return send_file(safe_path, as_attachment=True, download_name=safe_path.name)

    @app.get("/api/gdrive/status")
    def drive_status():
        from gdrive import status

        return jsonify(status(backend.data_root))

    @app.post("/api/gdrive/auth_url")
    def drive_auth_url():
        from gdrive import get_auth_url

        result = get_auth_url(backend.data_root)
        return jsonify(result), (200 if result.get("ok") else 400)

    @app.post("/api/gdrive/disconnect")
    def drive_disconnect():
        from gdrive import disconnect

        return jsonify(disconnect(backend.data_root))

    @app.post("/api/gdrive/sync")
    def drive_sync():
        from gdrive import upload_file

        journal = journal_backend_for_request()
        config = journal.load_config()
        if not config["google_sync"]["enabled"]:
            return jsonify(ok=False, error="Enable Google Drive sync in Settings first."), 400
        backup = journal.create_backup(sync_to_drive=False)
        folder_name = config["google_sync"]["folder_name"]
        if journal.profile_id is not None:
            folder_name = f"{folder_name} - {journal.profile_id}"
        try:
            upload_file(
                backup,
                backup.name,
                backend.data_root,
                folder_name,
            )
        except (OSError, RuntimeError, ValueError) as error:
            journal.log_sync_error(str(error))
            return jsonify(ok=False, error=str(error)), 502
        return jsonify(ok=True, message=f"Backed up {backup.name} to Google Drive.")

    @app.post("/api/gdrive/restore")
    def drive_restore():
        from gdrive import download_latest_backup

        journal = journal_backend_for_request()
        config = journal.load_config()
        if not config["google_sync"]["enabled"]:
            return jsonify(ok=False, error="Enable Google Drive sync in Settings first."), 400
        with tempfile.TemporaryDirectory(prefix="trading-journal-drive-") as temp_dir:
            archive = Path(temp_dir) / "drive-backup.zip"
            result = download_latest_backup(
                archive,
                backend.data_root,
                (
                    f"{config['google_sync']['folder_name']} - {journal.profile_id}"
                    if journal.profile_id is not None
                    else config["google_sync"]["folder_name"]
                ),
            )
            if not result.get("ok"):
                return jsonify(result), 404
            journal.restore_backup(archive)
        return jsonify(ok=True, trades=journal.load_trades(), config=journal.load_config())

    return app


app = create_app()
_runtime_handlers_registered = False


def restart_updated_application() -> None:
    mode = os.environ.get("TJ_MODE", "web")
    arguments = [sys.executable, str(Path(__file__).resolve())]
    arguments.extend(
        argument
        for argument in sys.argv[1:]
        if argument not in {"--choose", "--web", "--desktop"}
    )
    arguments.append(f"--{mode}")
    if mode == "web" and "--no-browser" not in arguments:
        arguments.append("--no-browser")
    os.execv(sys.executable, arguments)


def _register_runtime_handlers() -> None:
    global _runtime_handlers_registered
    if _runtime_handlers_registered:
        return
    backend = app.extensions["journal_backend"]
    register_exit_backup(backend)
    start_backup_scheduler(backend)
    _runtime_handlers_registered = True


def _wait_for_server(url: str, timeout: float = 10) -> bool:
    import urllib.error
    import urllib.request

    local_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with local_opener.open(url, timeout=0.5):
                return True
        except (OSError, urllib.error.URLError):
            time.sleep(0.1)
    return False


def load_desktop_webview():
    if sys.platform == "win32":
        try:
            os.environ["PYTHONNET_RUNTIME"] = "netfx"
            from pythonnet import load

            load("netfx")
        except (ImportError, RuntimeError) as error:
            raise RuntimeError(
                "Desktop mode could not initialize .NET Framework. "
                "Install or repair Microsoft .NET Framework 4.8."
            ) from error

    try:
        import webview
    except ImportError as error:
        raise RuntimeError(
            "Install pywebview to use desktop mode: python -m pip install pywebview"
        ) from error
    return webview


def run_desktop() -> None:
    from werkzeug.serving import make_server

    webview = load_desktop_webview()

    _register_runtime_handlers()
    try:
        http_server = make_server("127.0.0.1", 0, app, threaded=True)
    except OSError as error:
        raise RuntimeError(f"The local journal server could not bind to localhost: {error}") from error

    port = http_server.server_port
    os.environ["TJ_MODE"] = "desktop"
    server_thread = threading.Thread(
        target=http_server.serve_forever,
        name="trading-journal-web",
        daemon=True,
    )
    server_thread.start()
    url = f"http://127.0.0.1:{port}"
    if not _wait_for_server(f"{url}/api/mode"):
        http_server.shutdown()
        http_server.server_close()
        server_thread.join(timeout=1)
        raise RuntimeError(f"The local journal server did not respond at {url}.")
    webview.create_window("Trading Journal", url, width=1200, height=800)
    webview.start()


def choose_launch_mode() -> str | None:
    import tkinter as tk

    root = tk.Tk()
    root.title("Trading Journal")
    root.resizable(False, False)
    root.geometry("520x390")
    root.configure(background="#0b1017")
    root.option_add("*Font", ("Segoe UI", 10))
    selection: dict[str, str | None] = {"mode": None}

    def select(mode: str) -> None:
        selection["mode"] = mode
        root.destroy()

    background = "#0b1017"
    text_color = "#eaf0f6"
    muted = "#91a0ad"

    def center_window() -> None:
        root.update_idletasks()
        x = (root.winfo_screenwidth() - root.winfo_width()) // 2
        y = (root.winfo_screenheight() - root.winfo_height()) // 2
        root.geometry(f"+{x}+{y}")

    header = tk.Frame(root, background=background)
    header.pack(fill="x", padx=34, pady=(28, 19))
    tk.Label(
        header,
        text="TJ",
        background="#16372f",
        foreground="#4bd6a0",
        font=("Segoe UI", 15, "bold"),
        width=3,
        pady=6,
    ).pack(side="left", padx=(0, 13))
    title_area = tk.Frame(header, background=background)
    title_area.pack(side="left", fill="y")
    tk.Label(
        title_area,
        text="TRADING JOURNAL",
        background=background,
        foreground=muted,
        font=("Segoe UI", 8, "bold"),
    ).pack(anchor="w", pady=(1, 4))
    tk.Label(
        title_area,
        text="Choose your workspace",
        background=background,
        foreground=text_color,
        font=("Segoe UI", 17, "bold"),
    ).pack(anchor="w")
    tk.Label(
        root,
        text="Open your journal in the view that works best for you.",
        background=background,
        foreground=muted,
        font=("Segoe UI", 10),
    ).pack(anchor="w", padx=36, pady=(0, 17))

    options = tk.Frame(root, background=background)
    options.pack(fill="x", padx=32)

    def add_option(
        mode: str, heading: str, description: str, symbol: str, *, primary: bool
    ) -> None:
        normal = "#4bd6a0" if primary else "#16232e"
        hover = "#64e4b0" if primary else "#20313e"
        foreground = "#08140f" if primary else text_color
        border = "#4bd6a0" if primary else "#263642"
        card = tk.Frame(
            options,
            background=normal,
            highlightthickness=1,
            highlightbackground=border,
        )
        card.pack(fill="x", pady=6)
        button = tk.Button(
            card,
            text=f"{symbol}   {heading}\n       {description}",
            command=lambda: select(mode),
            anchor="w",
            justify="left",
            padx=17,
            pady=13,
            background=normal,
            foreground=foreground,
            activebackground=hover,
            activeforeground=foreground,
            relief="flat",
            borderwidth=0,
            cursor="hand2",
            font=("Segoe UI", 10, "bold"),
        )
        button.pack(fill="x", padx=1, pady=1)
        button.bind("<Enter>", lambda _event: button.configure(background=hover))
        button.bind("<Leave>", lambda _event: button.configure(background=normal))

    add_option(
        "web",
        "Web GUI",
        "Open in your browser · easy access and sharing",
        "↗",
        primary=True,
    )
    add_option(
        "desktop",
        "Desktop app",
        "Open in a dedicated application window",
        "▣",
        primary=False,
    )

    footer = tk.Frame(root, background=background)
    footer.pack(fill="x", padx=36, pady=(17, 0))
    tk.Label(
        footer,
        text="YOUR DATA STAYS ON THIS COMPUTER",
        background=background,
        foreground="#6f817f",
        font=("Segoe UI", 8, "bold"),
    ).pack(side="left")
    tk.Label(
        footer,
        text="Close this window to cancel",
        background=background,
        foreground="#657381",
        font=("Segoe UI", 8),
    ).pack(side="right")

    root.bind("<Escape>", lambda _event: root.destroy())
    root.protocol("WM_DELETE_WINDOW", root.destroy)
    root.after_idle(center_window)
    root.mainloop()
    return selection["mode"]


def run_web_mode(port: int, *, open_browser: bool = True) -> None:
    import tkinter as tk
    from tkinter import messagebox
    from werkzeug.serving import make_server

    _register_runtime_handlers()
    os.environ["TJ_MODE"] = "web"
    try:
        server = make_server("127.0.0.1", port, app, threaded=True)
    except OSError as error:
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror(
            "Trading Journal",
            f"Could not start the local journal on port {port}.\n\n{error}",
            parent=root,
        )
        root.destroy()
        return

    url = f"http://127.0.0.1:{port}"
    if open_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    finally:
        server.server_close()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Local-first trading journal")
    parser.add_argument("--desktop", action="store_true", help="Open the optional desktop window")
    parser.add_argument("--web", action="store_true", help="Open the browser-based journal")
    parser.add_argument("--choose", action="store_true", help="Choose between browser and desktop views")
    parser.add_argument("--port", type=int, default=5000, help="Local web server port")
    parser.add_argument("--no-browser", action="store_true", help="Do not open a browser")
    args = parser.parse_args(argv)
    if args.desktop and args.web:
        parser.error("--desktop and --web cannot be used together")
    mode = "desktop" if args.desktop else "web" if args.web else None
    if mode is None and (args.choose or getattr(sys, "frozen", False)):
        mode = choose_launch_mode()
        if mode is None:
            return
    mode = mode or "web"
    if mode == "desktop":
        run_desktop()
        return
    run_web_mode(args.port, open_browser=not args.no_browser)


if __name__ == "__main__":
    main()
