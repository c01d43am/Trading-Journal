import argparse
import re
import secrets
import tempfile
import threading
import time
import webbrowser
import zipfile
from pathlib import Path

from flask import Flask, jsonify, request, send_file, send_from_directory
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

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
    profile_sessions: dict[str, str] = {}
    profile_sessions_lock = threading.Lock()
    failed_unlocks: dict[str, tuple[int, float]] = {}
    failed_unlocks_lock = threading.Lock()
    app.extensions["journal_backend"] = backend
    if register_shutdown:
        register_exit_backup(backend)
        start_backup_scheduler(backend)

    def journal_backend_for_request(profile_id: str | None = None) -> JournalBackend:
        profiles_state = backend.load_backtesting_profiles()
        header_profile_id = request.headers.get("X-Trading-Profile-ID")
        if profile_id and header_profile_id and profile_id != header_profile_id:
            raise ValueError("Unlock the selected profile before accessing its journal.")
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

    def profile_session_is_valid(profile_id: str | None) -> bool:
        token = request.headers.get("X-Trading-Profile-Session")
        if not profile_id or not token:
            return False
        with profile_sessions_lock:
            return profile_sessions.get(token) == profile_id

    def public_profiles(state: dict) -> dict:
        return {
            "active_profile_id": state["active_profile_id"],
            "profiles": [
                {
                    "id": profile["id"],
                    "type": profile["type"],
                    "name": profile["name"],
                    "created_at": profile.get("created_at"),
                    "credential_configured": bool(profile.get("credential_hash")),
                    "credential_type": profile.get("credential_type"),
                }
                for profile in state["profiles"]
            ],
        }

    def profile_for_id(profile_id: str) -> dict | None:
        return next(
            (
                profile
                for profile in backend.load_backtesting_profiles()["profiles"]
                if profile["id"] == profile_id
            ),
            None,
        )

    def validate_credential(credential_type: object, credential: object) -> tuple[str, str]:
        if credential_type not in {"pin", "passcode", "password"}:
            raise ValueError("Choose a PIN, passcode, or password.")
        if not isinstance(credential, str):
            raise ValueError("Enter a PIN, passcode, or password.")
        if credential_type == "pin":
            if not re.fullmatch(r"\d{4,8}", credential):
                raise ValueError("PINs must contain 4 to 8 digits.")
        elif not 8 <= len(credential) <= 128:
            raise ValueError("Passcodes and passwords must contain 8 to 128 characters.")
        return str(credential_type), generate_password_hash(
            credential,
            method="pbkdf2:sha256:600000",
        )

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
    def require_profile_unlock():
        if not request.path.startswith("/api/"):
            return None
        if request.path in {
            "/api/mode",
            "/api/backtesting-profiles",
        } and request.method == "GET":
            return None
        if request.path == "/api/backtesting-profiles" and request.method == "POST":
            return None
        if request.endpoint in {
            "unlock_profile",
            "export_forgotten_profile",
            "delete_forgotten_profile",
        }:
            return None
        profile_id = request.headers.get("X-Trading-Profile-ID")
        if not profile_session_is_valid(profile_id):
            return jsonify(error="Unlock this profile before using the journal."), 401
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
        return jsonify(public_profiles(backend.load_backtesting_profiles()))

    @app.post("/api/backtesting-profiles")
    def update_backtesting_profiles():
        value = request.get_json(silent=False)
        if not isinstance(value, dict) or not isinstance(value.get("profiles"), list):
            raise ValueError("Backtesting profiles must contain a profile list.")
        current_state = backend.load_backtesting_profiles()
        current_by_id = {profile["id"]: profile for profile in current_state["profiles"]}
        input_profiles = []
        for item in value["profiles"]:
            if not isinstance(item, dict):
                input_profiles.append(item)
                continue
            item = {
                key: field
                for key, field in item.items()
                if key not in {"credential_configured", "credential_type"}
                or "credential_hash" in item
            }
            current = current_by_id.get(str(item.get("id", "")))
            if current and not any(
                isinstance(item.get(key), dict)
                for key in ("backtesting", "broker", "prop_firm")
            ) and not any(key in item for key in ("strategy", "broker", "prop_firm")):
                input_profiles.append({**current, **item})
            else:
                input_profiles.append(item)
        prepared_value = {**value, "profiles": input_profiles}
        candidate = backend.validate_backtesting_profiles(prepared_value)
        candidate_by_id = {profile["id"]: profile for profile in candidate["profiles"]}
        selected_id = request.headers.get("X-Trading-Profile-ID")
        authenticated = profile_session_is_valid(selected_id)
        changed_existing_ids = {
            profile_id
            for profile_id, old_profile in current_by_id.items()
            if profile_id not in candidate_by_id
            or {
                key: field
                for key, field in old_profile.items()
                if key not in {"credential_hash", "credential_type"}
            }
            != {
                key: field
                for key, field in candidate_by_id[profile_id].items()
                if key not in {"credential_hash", "credential_type"}
            }
        }
        if changed_existing_ids and (
            not authenticated or changed_existing_ids != {selected_id}
        ):
            return jsonify(error="Unlock a profile before changing or deleting it."), 401
        requested_active_id = candidate["active_profile_id"]
        if (
            requested_active_id in current_by_id
            and requested_active_id != current_state["active_profile_id"]
            and (not authenticated or requested_active_id != selected_id)
        ):
            return jsonify(error="Unlock a profile before switching profiles."), 401
        new_profiles = [
            profile for profile in candidate["profiles"]
            if profile["id"] not in current_by_id
        ]
        credential_setup = value.get("credential_setup")
        if new_profiles:
            if (
                not isinstance(credential_setup, dict)
                or credential_setup.get("profile_id") not in {
                    profile["id"] for profile in new_profiles
                }
            ):
                raise ValueError("Set a PIN, passcode, or password for each new profile.")
            credential_type, credential_hash = validate_credential(
                credential_setup.get("type"),
                credential_setup.get("credential"),
            )
            target_id = credential_setup["profile_id"]
            for profile in candidate["profiles"]:
                if profile["id"] == target_id:
                    profile["credential_type"] = credential_type
                    profile["credential_hash"] = credential_hash
            if len(new_profiles) != 1 or target_id != new_profiles[0]["id"]:
                raise ValueError("Create one secured profile at a time.")
        elif credential_setup is not None:
            raise ValueError("Credentials can only be set while creating a profile.")
        profiles = backend.save_backtesting_profiles(candidate)
        previous_profile_ids = set(current_by_id)
        current_profile_ids = {profile["id"] for profile in profiles["profiles"]}
        with profile_backends_lock:
            for profile_id in previous_profile_ids - current_profile_ids:
                profile_backends.pop(profile_id, None)
        return jsonify(public_profiles(profiles))

    @app.post("/api/profiles/<profile_id>/unlock")
    def unlock_profile(profile_id: str):
        state = backend.load_backtesting_profiles()
        profile = next(
            (item for item in state["profiles"] if item["id"] == profile_id),
            None,
        )
        if profile is None:
            return jsonify(error="This profile no longer exists."), 404

        payload = request.get_json(silent=False)
        if not isinstance(payload, dict):
            raise ValueError("Provide a PIN, passcode, or password.")
        credential = payload.get("credential")
        credential_hash = profile.get("credential_hash")
        if credential_hash:
            now = time.monotonic()
            with failed_unlocks_lock:
                attempts, locked_until = failed_unlocks.get(profile_id, (0, 0.0))
                if now < locked_until:
                    retry_after = max(1, int(locked_until - now))
                    return jsonify(
                        error=f"Too many incorrect attempts. Try again in {retry_after} seconds."
                    ), 429
            if not isinstance(credential, str) or not check_password_hash(
                credential_hash,
                credential,
            ):
                with failed_unlocks_lock:
                    attempts, _locked_until = failed_unlocks.get(profile_id, (0, 0.0))
                    attempts += 1
                    locked_until = time.monotonic() + 30 if attempts >= 5 else 0.0
                    failed_unlocks[profile_id] = (attempts, locked_until)
                return jsonify(error="Incorrect PIN, passcode, or password."), 401
            with failed_unlocks_lock:
                failed_unlocks.pop(profile_id, None)
        else:
            credential_type, credential_hash = validate_credential(
                payload.get("type"),
                credential,
            )
            for item in state["profiles"]:
                if item["id"] == profile_id:
                    item["credential_type"] = credential_type
                    item["credential_hash"] = credential_hash
                    break
            state = backend.save_backtesting_profiles(state)
            profile = next(item for item in state["profiles"] if item["id"] == profile_id)

        token = secrets.token_urlsafe(32)
        with profile_sessions_lock:
            expired_tokens = [
                session_token
                for session_token, session_profile_id in profile_sessions.items()
                if session_profile_id == profile_id
            ]
            for session_token in expired_tokens:
                profile_sessions.pop(session_token, None)
            profile_sessions[token] = profile_id
        return jsonify(
            token=token,
            profile={
                key: value
                for key, value in profile.items()
                if key != "credential_hash"
            },
        )

    @app.get("/api/profiles/<profile_id>/export")
    def export_forgotten_profile(profile_id: str):
        profile = profile_for_id(profile_id)
        if profile is None:
            return jsonify(error="This profile no longer exists."), 404
        journal = journal_backend_for_request(profile_id)
        with tempfile.NamedTemporaryFile(
            prefix="trading-journal-profile-",
            suffix=".zip",
            delete=False,
        ) as backup_file:
            backup_path = Path(backup_file.name)
        response = None
        try:
            journal.create_backup(dest=backup_path, sync_to_drive=False)
            download_name = f"{secure_filename(profile['name']) or 'trading-profile'}-backup.zip"
            response = send_file(
                backup_path,
                as_attachment=True,
                download_name=download_name,
            )
            response.call_on_close(lambda: backup_path.unlink(missing_ok=True))
            return response
        finally:
            if response is None:
                backup_path.unlink(missing_ok=True)

    @app.post("/api/profiles/<profile_id>/forgot-delete")
    def delete_forgotten_profile(profile_id: str):
        state = backend.load_backtesting_profiles()
        profile = next(
            (item for item in state["profiles"] if item["id"] == profile_id),
            None,
        )
        if profile is None:
            return jsonify(error="This profile no longer exists."), 404
        payload = request.get_json(silent=False)
        if not isinstance(payload, dict) or payload.get("confirm_name") != profile["name"]:
            return jsonify(error="The profile name did not match; nothing was deleted."), 400
        remaining = [
            item for item in state["profiles"] if item["id"] != profile_id
        ]
        active_profile_id = (
            None if state["active_profile_id"] == profile_id else state["active_profile_id"]
        )
        backend.save_backtesting_profiles({
            "profiles": remaining,
            "active_profile_id": active_profile_id,
        })
        with profile_backends_lock:
            profile_backends.pop(profile_id, None)
        with profile_sessions_lock:
            for token, session_profile_id in list(profile_sessions.items()):
                if session_profile_id == profile_id:
                    profile_sessions.pop(token, None)
        return jsonify(ok=True)

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
    requested_port = port
    last_error = None
    server = None
    for candidate_port in range(requested_port, min(requested_port + 100, 65536)):
        if candidate_port == 5001:
            continue
        try:
            server = make_server("127.0.0.1", candidate_port, app, threaded=True)
            port = candidate_port
            break
        except OSError as error:
            last_error = error

    if server is None:
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror(
            "Trading Journal",
            f"Could not start the local journal on ports {requested_port}–{min(requested_port + 99, 65535)}.\n\n{last_error}",
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
    parser.add_argument("--port", type=int, default=5007, help="Local web server port")
    parser.add_argument("--no-browser", action="store_true", help="Do not open a browser")
    args = parser.parse_args(argv)
    run_web_mode(args.port, open_browser=not args.no_browser)


if __name__ == "__main__":
    main()
