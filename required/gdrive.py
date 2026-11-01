import os
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


SCOPES = ["https://www.googleapis.com/auth/drive.file"]
CALLBACK_URI = "http://127.0.0.1:5001/callback"
_auth_flow = None
_auth_server = None
_auth_data_dir: Path | None = None
_auth_lock = threading.Lock()


def _credentials_path() -> Path:
    import sys

    app_dir = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent
    return app_dir / "credentials.json"


def _token_path(data_dir: Path | None = None) -> Path:
    if data_dir:
        return data_dir / "google_token.json"
    root = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    return root / "TradingJournal" / "data" / "google_token.json"


def is_available() -> bool:
    from importlib.util import find_spec

    try:
        return (
            find_spec("googleapiclient.discovery") is not None
            and find_spec("google_auth_oauthlib.flow") is not None
        )
    except (ImportError, ModuleNotFoundError):
        return False


def has_credentials() -> bool:
    return _credentials_path().is_file()


def is_connected(data_dir: Path | None = None) -> bool:
    return _token_path(data_dir).is_file()


def status(data_dir: Path | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {
        "available": is_available(),
        "configured": has_credentials(),
        "connected": False,
        "email": None,
    }
    if not result["available"] or not result["configured"]:
        return result
    try:
        credentials = _load_credentials(data_dir)
        if credentials and credentials.valid:
            result["connected"] = True
            result["email"] = getattr(credentials, "id_token", {}).get("email") if isinstance(
                getattr(credentials, "id_token", None), dict
            ) else None
    except (OSError, ValueError, ImportError):
        result["connected"] = False
    return result


def _load_credentials(data_dir: Path | None = None):
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    token_file = _token_path(data_dir)
    if not token_file.is_file():
        return None
    credentials = Credentials.from_authorized_user_file(str(token_file), SCOPES)
    if credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())
        token_file.write_text(credentials.to_json(), encoding="utf-8")
    return credentials


def _service(data_dir: Path | None = None):
    from googleapiclient.discovery import build

    credentials = _load_credentials(data_dir)
    if not credentials or not credentials.valid:
        raise RuntimeError("Google Drive is not connected. Sign in from Settings first.")
    return build("drive", "v3", credentials=credentials, cache_discovery=False)


def _callback_server():
    class CallbackHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            global _auth_flow, _auth_data_dir
            if urlparse(self.path).path != "/callback":
                self.send_error(404)
                return
            try:
                with _auth_lock:
                    flow = _auth_flow
                if flow is None:
                    raise RuntimeError("There is no active Google sign-in request.")
                flow.fetch_token(authorization_response=f"{CALLBACK_URI}{self.path}")
                credentials = flow.credentials
                token_path = _token_path(_auth_data_dir)
                token_path.parent.mkdir(parents=True, exist_ok=True)
                token_path.write_text(credentials.to_json(), encoding="utf-8")
                body = b"Google Drive connected. You can close this tab and return to Trading Journal."
                self.send_response(200)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception as error:
                body = f"Google sign-in failed: {error}".encode("utf-8", errors="replace")
                self.send_response(400)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        def log_message(self, _format, *_args):
            del _format, _args

    return HTTPServer(("127.0.0.1", 5001), CallbackHandler)


def get_auth_url(data_dir: Path | None = None) -> dict[str, Any]:
    global _auth_flow, _auth_server, _auth_data_dir
    if not is_available():
        return {"ok": False, "error": "Google Drive libraries are not installed."}
    if not has_credentials():
        return {"ok": False, "error": "Place your Google Desktop OAuth credentials in credentials.json."}
    try:
        from google_auth_oauthlib.flow import Flow

        flow = Flow.from_client_secrets_file(str(_credentials_path()), scopes=SCOPES)
        flow.redirect_uri = CALLBACK_URI
        authorization_url, _ = flow.authorization_url(
            access_type="offline", include_granted_scopes="true", prompt="consent"
        )
        with _auth_lock:
            if _auth_server is None:
                _auth_server = _callback_server()
                threading.Thread(
                    target=_auth_server.serve_forever,
                    name="journal-google-oauth-callback",
                    daemon=True,
                ).start()
            _auth_flow = flow
            _auth_data_dir = data_dir
        return {"ok": True, "url": authorization_url}
    except OSError as error:
        return {"ok": False, "error": f"Could not start Google sign-in callback on port 5001: {error}"}
    except (ValueError, ImportError) as error:
        return {"ok": False, "error": str(error)}


def disconnect(data_dir: Path | None = None) -> dict[str, Any]:
    token = _token_path(data_dir)
    if token.exists():
        token.unlink()
    return {"ok": True}


def _folder_id(service, folder_name: str) -> str:
    escaped_name = folder_name.replace("\\", "\\\\").replace("'", "\\'")
    result = service.files().list(
        q=f"name = '{escaped_name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        spaces="drive",
        fields="files(id, name)",
        pageSize=100,
    ).execute()
    folders = result.get("files", [])
    if folders:
        return folders[0]["id"]
    created = service.files().create(
        body={"name": folder_name, "mimeType": "application/vnd.google-apps.folder"},
        fields="id",
    ).execute()
    return created["id"]


def upload_file(
    local_path: Path,
    drive_name: str,
    data_dir: Path | None = None,
    folder_name: str = "TradingJournal",
) -> dict[str, Any]:
    from googleapiclient.http import MediaFileUpload

    service = _service(data_dir)
    parent_id = _folder_id(service, folder_name)
    escaped_name = drive_name.replace("\\", "\\\\").replace("'", "\\'")
    existing = service.files().list(
        q=f"name = '{escaped_name}' and '{parent_id}' in parents and trashed = false",
        spaces="drive",
        fields="files(id)",
        pageSize=10,
    ).execute().get("files", [])
    media = MediaFileUpload(str(local_path), resumable=True)
    if existing:
        result = service.files().update(
            fileId=existing[0]["id"], media_body=media, fields="id, name"
        ).execute()
    else:
        result = service.files().create(
            body={"name": drive_name, "parents": [parent_id]},
            media_body=media,
            fields="id, name",
        ).execute()
    return {"ok": True, "file": result}


def download_latest_backup(
    destination: Path,
    data_dir: Path | None = None,
    folder_name: str = "TradingJournal",
) -> dict[str, Any]:
    from googleapiclient.http import MediaIoBaseDownload

    service = _service(data_dir)
    parent_id = _folder_id(service, folder_name)
    result = service.files().list(
        q=f"'{parent_id}' in parents and name contains 'backup_' and trashed = false",
        orderBy="createdTime desc",
        pageSize=1,
        fields="files(id, name)",
    ).execute()
    files = result.get("files", [])
    if not files:
        return {"ok": False, "error": "No backup was found in Google Drive."}
    request = service.files().get_media(fileId=files[0]["id"])
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as file_handle:
        downloader = MediaIoBaseDownload(file_handle, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()
    return {"ok": True, "file": files[0]}


def list_images(data_dir: Path | None = None) -> dict[str, Any]:
    service = _service(data_dir)
    folder_id = _folder_id(service, "TradingJournal")
    result = service.files().list(
        q=f"'{folder_id}' in parents and trashed = false",
        fields="files(id, name, mimeType)",
        pageSize=1000,
    ).execute()
    return {"ok": True, "files": result.get("files", [])}
