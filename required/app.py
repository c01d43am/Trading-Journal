import argparse
import tempfile
import threading
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


def create_app(data_dir: Path | None = None, *, register_shutdown: bool = False) -> Flask:
    web_dir = APP_ROOT / "web"
    app = Flask(__name__, static_folder=str(web_dir), static_url_path="")
    app.config["MAX_CONTENT_LENGTH"] = 250 * 1024 * 1024
    backend = JournalBackend(data_dir)
    profile_backends: dict[str, JournalBackend] = {}
    profile_backends_lock = threading.Lock()
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
        return jsonify(mode="web")

    @app.get("/api/trades")
    def list_trades():
        return jsonify(journal_backend_for_request().load_trades())

    @app.get("/api/backtesting-profiles")
    def list_backtesting_profiles():
        return jsonify(backend.load_backtesting_profiles())

    @app.post("/api/backtesting-profiles")
    def update_backtesting_profiles():
        previous_profile_ids = {
            profile["id"]
            for profile in backend.load_backtesting_profiles()["profiles"]
        }
        profiles = backend.save_backtesting_profiles(request.get_json(silent=False))
        current_profile_ids = {profile["id"] for profile in profiles["profiles"]}
        with profile_backends_lock:
            for profile_id in previous_profile_ids - current_profile_ids:
                profile_backends.pop(profile_id, None)
        return jsonify(profiles)

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


def _register_runtime_handlers() -> None:
    global _runtime_handlers_registered
    if _runtime_handlers_registered:
        return
    backend = app.extensions["journal_backend"]
    register_exit_backup(backend)
    start_backup_scheduler(backend)
    _runtime_handlers_registered = True


def run_web_mode(port: int, *, open_browser: bool = True) -> None:
    import tkinter as tk
    from tkinter import messagebox
    from werkzeug.serving import make_server

    _register_runtime_handlers()
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
    parser.add_argument("--port", type=int, default=5000, help="Local web server port")
    parser.add_argument("--no-browser", action="store_true", help="Do not open a browser")
    args = parser.parse_args(argv)
    run_web_mode(args.port, open_browser=not args.no_browser)


if __name__ == "__main__":
    main()
