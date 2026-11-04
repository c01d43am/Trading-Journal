import atexit
import base64
import binascii
import hashlib
import io
import json
import math
import os
import re
import shutil
import sqlite3
import sys
import tempfile
import threading
import uuid
import zipfile
from contextlib import closing
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Any

from PIL import Image, UnidentifiedImageError
from werkzeug.security import check_password_hash, generate_password_hash


APP_ROOT = Path(
    getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent)
)
MAX_IMAGE_SIZE = 12 * 1024 * 1024
MAX_RESTORE_SIZE = 250 * 1024 * 1024
MONTHLY_BACKUP_INTERVAL_SECONDS = 30 * 24 * 60 * 60
DEFAULT_CONFIG: dict[str, Any] = {
    "auto_backup": True,
    "custom_fields": [],
    "google_sync": {"enabled": False, "folder_name": "TradingJournal"},
}
_auto_backup_lock = threading.Lock()
_auto_backup_done = False


def data_root() -> Path:
    root = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    return root / "TradingJournal" / "data"


def _legacy_source_data_root() -> Path | None:
    if not getattr(sys, "frozen", False):
        candidate = Path(__file__).resolve().parent / "data"
        return candidate if (candidate / "trades.json").is_file() else None

    for parent in Path(sys.executable).resolve().parents:
        candidate = parent / "required" / "data"
        if (candidate / "trades.json").is_file():
            return candidate
    return None


class JournalBackend:
    def __init__(self, root: Path | None = None, *, profile_id: str | None = None):
        self.data_root = root or data_root()
        self.profile_id = profile_id
        self.root = (
            self.data_root
            if profile_id is None
            else self.data_root
            / "profiles"
            / hashlib.sha256(profile_id.encode("utf-8")).hexdigest()
        )
        self.images_dir = self.root / "images"
        self.backups_dir = self.root
        self.trades_path = self.root / "trades.json"
        self.config_path = self.root / "config.json"
        self.backtesting_profiles_path = self.data_root / "backtesting_profiles.json"
        self.token_path = self.data_root / "google_token.json"
        self._lock = threading.RLock()
        if root is None and profile_id is None:
            self._migrate_source_data()
        self.ensure_data_folder()

    def for_profile(self, profile_id: str) -> "JournalBackend":
        return JournalBackend(self.data_root, profile_id=profile_id)

    def prepare_profile_data(self, profile_id: str) -> None:
        if profile_id not in {
            profile["id"] for profile in self.load_backtesting_profiles()["profiles"]
        }:
            raise ValueError("Choose a saved profile before opening its journal.")
        with self._lock:
            marker = self.data_root / ".profile_data_migration.json"
            if marker.exists():
                return
            profiles = self.load_backtesting_profiles()
            migration_profile_id = profiles["active_profile_id"] or profile_id
            self._migrate_legacy_data(migration_profile_id)

    def _migrate_legacy_data(self, profile_id: str) -> None:
        marker = self.data_root / ".profile_data_migration.json"
        if marker.exists():
            return
        profile_root = (
            self.data_root
            / "profiles"
            / hashlib.sha256(profile_id.encode("utf-8")).hexdigest()
        )
        profile_images = profile_root / "images"
        profile_root.mkdir(parents=True, exist_ok=True)
        profile_images.mkdir(parents=True, exist_ok=True)
        profile_trades_path = profile_root / "trades.json"
        profile_config_path = profile_root / "config.json"

        legacy_trades: list[dict[str, Any]] = []
        current_trades: list[dict[str, Any]] = []
        if self.trades_path.is_file():
            try:
                legacy_trades = json.loads(self.trades_path.read_text(encoding="utf-8"))
                current_trades = (
                    json.loads(profile_trades_path.read_text(encoding="utf-8"))
                    if profile_trades_path.is_file()
                    else []
                )
            except (OSError, json.JSONDecodeError) as error:
                raise RuntimeError(f"Could not separate existing journal data: {error}") from error
            if not isinstance(legacy_trades, list) or any(
                not isinstance(trade, dict) for trade in legacy_trades
            ):
                raise RuntimeError("Existing journal trades have an invalid format.")
            if not isinstance(current_trades, list) or any(
                not isinstance(trade, dict) for trade in current_trades
            ):
                raise RuntimeError("Profile journal trades have an invalid format.")
        if self.config_path.is_file() and not profile_config_path.exists():
            try:
                config = json.loads(self.config_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as error:
                raise RuntimeError(f"Could not separate existing journal settings: {error}") from error
            if isinstance(config, dict):
                if Path(config.get("backup_directory", self.root)).resolve() == self.root.resolve():
                    config["backup_directory"] = str(profile_root)
                self._write_json(profile_config_path, config)

        image_rewrites: dict[str, str] = {}
        if self.images_dir.is_dir():
            for image in self.images_dir.rglob("*"):
                if not image.is_file():
                    continue
                relative = image.relative_to(self.images_dir)
                destination = profile_images / relative
                if destination.exists() and destination.read_bytes() != image.read_bytes():
                    destination = destination.with_name(
                        f"{destination.stem}_imported_{uuid.uuid4().hex[:8]}{destination.suffix}"
                    )
                destination.parent.mkdir(parents=True, exist_ok=True)
                if not destination.exists():
                    shutil.copy2(image, destination)
                old_name = (Path("images") / relative).as_posix()
                new_name = (Path("images") / destination.relative_to(profile_images)).as_posix()
                if old_name != new_name:
                    image_rewrites[old_name] = new_name

        for trade in legacy_trades:
            for key in ("image_file", "before_image", "after_image"):
                if trade.get(key) in image_rewrites:
                    trade[key] = image_rewrites[trade[key]]
        existing_ids = {
            str(trade.get("id")) for trade in current_trades if trade.get("id")
        }
        self._write_json(
            profile_trades_path,
            [
                *current_trades,
                *(
                    trade
                    for trade in legacy_trades
                    if not trade.get("id") or str(trade["id"]) not in existing_ids
                ),
            ],
        )

        self._write_json(
            marker,
            {"profile_id": profile_id},
        )

    def _migrate_source_data(self) -> None:
        legacy_root = _legacy_source_data_root()
        if legacy_root is None or legacy_root.resolve() == self.root.resolve():
            return
        marker = self.root / ".source_data_migrated"
        if marker.exists():
            return

        legacy_trades_path = legacy_root / "trades.json"
        try:
            legacy_trades = json.loads(legacy_trades_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise RuntimeError(f"Could not import existing journal data: {error}") from error
        if not isinstance(legacy_trades, list) or any(
            not isinstance(trade, dict) for trade in legacy_trades
        ):
            raise RuntimeError("Existing source journal data has an invalid format.")

        self.root.mkdir(parents=True, exist_ok=True)
        if self.trades_path.exists():
            try:
                trades = json.loads(self.trades_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as error:
                raise RuntimeError(f"Could not read the current journal data: {error}") from error
            if not isinstance(trades, list) or any(
                not isinstance(trade, dict) for trade in trades
            ):
                raise RuntimeError("The current journal data has an invalid format.")
        else:
            trades = []

        current_by_id = {str(trade.get("id")): trade for trade in trades if trade.get("id")}
        imported = []
        for legacy_trade in legacy_trades:
            trade = dict(legacy_trade)
            trade_id = str(trade.get("id", ""))
            if trade_id and trade_id in current_by_id:
                if current_by_id[trade_id] == trade:
                    continue
                trade["id"] = f"{trade_id}_imported_{uuid.uuid4().hex[:8]}"
            elif not trade_id:
                trade["id"] = f"imported_{uuid.uuid4().hex}"
            imported.append(trade)

        legacy_images = legacy_root / "images"
        if legacy_images.is_dir():
            for image in legacy_images.rglob("*"):
                if not image.is_file():
                    continue
                relative = image.relative_to(legacy_images)
                destination = self.images_dir / relative
                if destination.exists() and destination.read_bytes() != image.read_bytes():
                    destination = destination.with_name(
                        f"{destination.stem}_imported_{uuid.uuid4().hex[:8]}{destination.suffix}"
                    )
                destination.parent.mkdir(parents=True, exist_ok=True)
                if not destination.exists():
                    shutil.copy2(image, destination)
                old_name = (Path("images") / relative).as_posix()
                new_name = (Path("images") / destination.relative_to(self.images_dir)).as_posix()
                if old_name != new_name:
                    for trade in imported:
                        for key in ("image_file", "before_image", "after_image"):
                            if trade.get(key) == old_name:
                                trade[key] = new_name

        if imported:
            self._write_json(self.trades_path, [*trades, *imported])
        marker.write_text("complete\n", encoding="utf-8")

    def ensure_data_folder(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        self.images_dir.mkdir(parents=True, exist_ok=True)
        if self.profile_id is None and not self.trades_path.exists():
            self._migrate_legacy_database()
        if not self.trades_path.exists():
            self._write_json(self.trades_path, [])
        if not self.config_path.exists():
            self._write_json(self.config_path, DEFAULT_CONFIG)
        if self.profile_id is None and not self.backtesting_profiles_path.exists():
            self._write_json(
                self.backtesting_profiles_path,
                {"profiles": [], "active_profile_id": None},
            )
        if self.profile_id is None:
            self._normalize_legacy_json_trades()
        self.load_config()
        if self.profile_id is None:
            self.load_trades()

    @staticmethod
    def _write_json(path: Path, value: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(
            json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        os.replace(temporary, path)

    def _migrate_legacy_database(self) -> None:
        legacy_root = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
        legacy_db = legacy_root / "TradingJournal" / "journal.sqlite3"
        legacy_images = legacy_root / "TradingJournal" / "screenshots"
        if not legacy_db.is_file():
            return
        try:
            with closing(sqlite3.connect(legacy_db)) as connection:
                connection.row_factory = sqlite3.Row
                rows = connection.execute("SELECT * FROM trades ORDER BY id").fetchall()
        except sqlite3.Error:
            return

        migrated = []
        for row in rows:
            trade = dict(row)
            entry_date = str(trade.get("entry_date", ""))
            trade["date"] = entry_date[:10]
            trade["time"] = entry_date[11:19] if len(entry_date) > 10 else ""
            for key in ("before_image", "after_image"):
                filename = trade.get(key)
                if filename and legacy_images.is_dir():
                    source = legacy_images / Path(filename).name
                    if source.is_file():
                        destination = self.images_dir / source.name
                        shutil.copy2(source, destination)
                        trade[key] = f"images/{destination.name}"
            trade["image_file"] = trade.get("after_image") or trade.get("before_image") or ""
            trade["id"] = str(trade.get("id") or uuid.uuid4().hex)
            trade["grade"] = trade.get("setup_grade", "")
            if trade.get("stop_loss") is not None:
                try:
                    risk = abs(float(trade["entry_price"]) - float(trade["stop_loss"])) * float(trade["size"])
                    trade["r_multiple"] = float(trade["pnl"]) / risk if risk else None
                except (KeyError, TypeError, ValueError):
                    trade["r_multiple"] = None
            trade.setdefault("custom_fields", {})
            migrated.append(trade)
        self._write_json(self.trades_path, migrated)

    def _normalize_legacy_json_trades(self) -> None:
        trades = self.load_trades()
        changed = False
        for trade in trades:
            if not any(key in trade for key in ("entry_date", "setup_grade", "before_image", "after_image")):
                continue
            entry_date = str(trade.get("entry_date", ""))
            if not trade.get("date") and entry_date:
                trade["date"] = entry_date[:10]
                changed = True
            if not trade.get("time") and "T" in entry_date:
                trade["time"] = entry_date.split("T", 1)[1][:8]
                changed = True
            if "grade" not in trade and "setup_grade" in trade:
                trade["grade"] = trade["setup_grade"]
                changed = True
            if not trade.get("image_file"):
                image_file = trade.get("after_image") or trade.get("before_image") or ""
                if image_file:
                    trade["image_file"] = image_file
                    changed = True
            if "r_multiple" not in trade and trade.get("stop_loss") is not None:
                try:
                    risk = abs(float(trade["entry_price"]) - float(trade["stop_loss"])) * float(trade["size"])
                    trade["r_multiple"] = float(trade["pnl"]) / risk if risk else None
                except (KeyError, TypeError, ValueError):
                    trade["r_multiple"] = None
                changed = True
        if changed:
            with self._lock:
                self._write_json(self.trades_path, trades)

    def load_trades(self) -> list[dict[str, Any]]:
        with self._lock:
            try:
                trades = json.loads(self.trades_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as error:
                raise RuntimeError(f"Could not read the trade journal: {error}") from error
        if not isinstance(trades, list) or any(not isinstance(item, dict) for item in trades):
            raise RuntimeError("The trade journal file has an invalid format.")
        return trades

    def save_trade(self, trade_dict: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(trade_dict, dict):
            raise ValueError("Trade data must be a JSON object.")
        trade = dict(trade_dict)
        config = self.load_config()
        custom_values = trade.get("custom_fields", {})
        if not isinstance(custom_values, dict):
            raise ValueError("Custom field values must be an object.")
        allowed_custom = {field["name"] for field in config["custom_fields"]}
        trade["custom_fields"] = {
            key: value for key, value in custom_values.items() if key in allowed_custom
        }
        now = datetime.now().astimezone()
        trade.setdefault("id", f"trade_{now.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}")
        trade["date"] = self._validate_date(trade.get("date"))
        trade["time"] = self._validate_time(trade.get("time"))
        instrument = str(trade.get("instrument", "")).strip()
        if not instrument or len(instrument) > 40:
            raise ValueError("Instrument is required and must be 40 characters or fewer.")
        trade["instrument"] = instrument
        if trade.get("direction") not in ("Long", "Short"):
            raise ValueError("Direction must be Long or Short.")

        def optional_number(key: str, *aliases: str) -> float | None:
            value = trade.get(key)
            if value in (None, ""):
                for alias in aliases:
                    value = trade.get(alias)
                    if value not in (None, ""):
                        break
            if value in (None, ""):
                return None
            try:
                result = float(value)
            except (TypeError, ValueError):
                raise ValueError(f"{key.replace('_', ' ').capitalize()} must be a number.") from None
            if not math.isfinite(result):
                raise ValueError(f"{key.replace('_', ' ').capitalize()} must be a finite number.")
            return result

        entry = optional_number("entry_price")
        exit_price = optional_number("exit_price")
        size = optional_number("size", "position_size")
        for key in ("entry_price", "exit_price", "size"):
            value = entry if key == "entry_price" else exit_price if key == "exit_price" else size
            trade[key] = value
            if value is not None and value <= 0:
                raise ValueError(f"{key.replace('_', ' ').capitalize()} must be greater than zero.")
        trade["stop_loss"] = optional_number("stop_loss")
        trade["take_profit"] = optional_number("take_profit")

        if trade.get("pnl") in (None, ""):
            if entry is None or exit_price is None or size is None:
                raise ValueError("P&L is required unless entry, exit, and position size are provided.")
            difference = exit_price - entry
            trade["pnl"] = (difference if trade["direction"] == "Long" else -difference) * size
        else:
            try:
                trade["pnl"] = float(trade["pnl"])
            except (TypeError, ValueError):
                raise ValueError("P&L must be a number.") from None
            if not math.isfinite(trade["pnl"]):
                raise ValueError("P&L must be a finite number.")
        r_multiple = optional_number("r_multiple")
        if r_multiple is None and entry is not None and size is not None and trade["stop_loss"] is not None:
            risk = abs(entry - trade["stop_loss"]) * size
            r_multiple = float(trade["pnl"]) / risk if risk else None
        trade["r_multiple"] = r_multiple
        trade.setdefault("grade", "")
        trade.setdefault("notes", "")
        trade.setdefault("image_file", "")
        with self._lock:
            trades = self.load_trades()
            if any(str(entry.get("id")) == str(trade["id"]) for entry in trades):
                raise ValueError("A trade with this id already exists.")
            trades.append(trade)
            self._write_json(self.trades_path, trades)
        self.sync_if_enabled()
        return trade

    @staticmethod
    def _validate_date(value: Any) -> str:
        try:
            return datetime.strptime(str(value), "%Y-%m-%d").strftime("%Y-%m-%d")
        except ValueError:
            raise ValueError("Date must use YYYY-MM-DD format.") from None

    @staticmethod
    def _validate_time(value: Any) -> str:
        try:
            return datetime.strptime(str(value), "%H:%M:%S").strftime("%H:%M:%S")
        except ValueError:
            try:
                return datetime.strptime(str(value), "%H:%M").strftime("%H:%M:%S")
            except ValueError:
                raise ValueError("Time must use HH:MM or HH:MM:SS format.") from None

    def delete_trade(self, trade_id: str) -> None:
        with self._lock:
            trades = self.load_trades()
            deleted = [trade for trade in trades if str(trade.get("id")) == str(trade_id)]
            retained = [trade for trade in trades if str(trade.get("id")) != str(trade_id)]
            if not deleted:
                raise FileNotFoundError("Trade not found.")
            self._write_json(self.trades_path, retained)
        used_images = {trade.get("image_file") for trade in retained}
        for trade in deleted:
            image_file = trade.get("image_file")
            if image_file and image_file not in used_images:
                try:
                    image_path = self.get_download(image_file)
                except (ValueError, FileNotFoundError):
                    continue
                if image_path.parent == self.images_dir.resolve():
                    image_path.unlink(missing_ok=True)

    def save_image(self, image_base64: str) -> str:
        if not isinstance(image_base64, str):
            raise ValueError("Image data must be base64 text.")
        header_match = re.fullmatch(
            r"data:image/(png|jpeg|jpg);base64,([A-Za-z0-9+/=\r\n]+)", image_base64
        )
        encoded = header_match.group(2) if header_match else image_base64
        try:
            image_bytes = base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError):
            raise ValueError("Image data is not valid base64.") from None
        if not image_bytes or len(image_bytes) > MAX_IMAGE_SIZE:
            raise ValueError("Image must be smaller than 12 MB.")
        try:
            with Image.open(io.BytesIO(image_bytes)) as image:
                image_format = image.format
                image.verify()
        except (UnidentifiedImageError, OSError):
            raise ValueError("The uploaded data is not a valid image.") from None
        if image_format not in ("PNG", "JPEG"):
            raise ValueError("Only PNG and JPEG images are supported.")
        filename = f"{uuid.uuid4().hex}.{'png' if image_format == 'PNG' else 'jpg'}"
        (self.images_dir / filename).write_bytes(image_bytes)
        return f"images/{filename}"

    def load_config(self) -> dict[str, Any]:
        try:
            config = json.loads(self.config_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise RuntimeError(f"Could not read journal settings: {error}") from error
        validated = self.validate_config(config, default_backup_directory=self.root)
        self.backups_dir = Path(validated["backup_directory"])
        return validated

    @staticmethod
    def validate_config(
        config: Any, *, default_backup_directory: Path | None = None
    ) -> dict[str, Any]:
        if not isinstance(config, dict):
            raise ValueError("Settings must be a JSON object.")
        result = {**DEFAULT_CONFIG, **config}
        backup_directory = Path(
            str(result.get("backup_directory", default_backup_directory or ""))
        ).expanduser()
        if not backup_directory.is_absolute():
            raise ValueError("Backup folder must be an absolute path.")
        custom_fields = result.get("custom_fields")
        if not isinstance(custom_fields, list):
            raise ValueError("Custom fields must be a list.")
        cleaned_fields = []
        names = set()
        for field in custom_fields:
            if not isinstance(field, dict):
                raise ValueError("Each custom field needs a name and a type.")
            name = str(field.get("name", "")).strip()
            field_type = field.get("type")
            if not name or len(name) > 40 or field_type not in ("text", "number", "date"):
                raise ValueError("Custom fields need a name (max 40 chars) and a valid type.")
            if name.casefold() in names:
                raise ValueError(f"Custom field '{name}' is duplicated.")
            names.add(name.casefold())
            cleaned_fields.append({"name": name, "type": field_type})
        google_sync = result.get("google_sync", {})
        if not isinstance(google_sync, dict):
            raise ValueError("Google sync settings must be an object.")
        result["google_sync"] = {
            "enabled": bool(google_sync.get("enabled", False)),
            "folder_name": str(google_sync.get("folder_name", "TradingJournal"))[:80],
        }
        result["auto_backup"] = bool(result.get("auto_backup", True))
        result.pop("backup_interval_minutes", None)
        result["backup_directory"] = str(backup_directory)
        result["custom_fields"] = cleaned_fields
        return result

    def save_config(self, config: dict[str, Any]) -> dict[str, Any]:
        validated = self.validate_config(config, default_backup_directory=self.root)
        backup_directory = Path(validated["backup_directory"])
        if backup_directory.resolve().is_relative_to(self.images_dir.resolve()):
            raise ValueError("Backup folder cannot be inside the images folder.")
        backup_directory.mkdir(parents=True, exist_ok=True)
        if not backup_directory.is_dir():
            raise ValueError("Backup folder must be a directory.")
        with self._lock:
            self._write_json(self.config_path, validated)
        self.backups_dir = backup_directory
        return validated

    @staticmethod
    def validate_backtesting_profiles(value: Any) -> dict[str, Any]:
        if not isinstance(value, dict) or not isinstance(value.get("profiles"), list):
            raise ValueError("Backtesting profiles must contain a profile list.")
        if len(value["profiles"]) > 100:
            raise ValueError("You can save up to 100 backtesting profiles.")

        profiles = []
        profile_ids = set()
        profile_names = set()
        for item in value["profiles"]:
            if not isinstance(item, dict):
                raise ValueError("Each backtesting profile must be an object.")
            name = str(item.get("name", "")).strip()
            profile_type = str(item.get("type", "backtesting")).strip().lower()
            if profile_type not in {"backtesting", "broker", "prop_firm"}:
                raise ValueError("Profile type must be backtesting, broker, or prop_firm.")

            mode_key = {
                "backtesting": "backtesting",
                "broker": "broker",
                "prop_firm": "prop_firm",
            }[profile_type]
            access_method = item.get("access_method")
            access_hash = item.get("access_hash")
            access = {}
            if access_hash is not None:
                if access_method not in {"password", "pin", "passcode"}:
                    raise ValueError("Profile access method is invalid.")
                if not isinstance(access_hash, str) or not access_hash.startswith("scrypt:"):
                    raise ValueError("Profile access hash is invalid.")
                access = {
                    "access_method": access_method,
                    "access_hash": access_hash,
                }
            modern_data = item.get(mode_key)
            profile_data_keys = ("backtesting", "broker", "prop_firm")
            nested_mode_data = [
                key for key in profile_data_keys if isinstance(item.get(key), dict)
            ]
            if nested_mode_data and nested_mode_data != [mode_key]:
                raise ValueError("A profile can contain fields for its selected mode only.")
            has_modern_backtesting_data = profile_type == "backtesting" and mode_key in item
            if isinstance(modern_data, dict) or has_modern_backtesting_data:
                if not isinstance(modern_data, dict):
                    raise ValueError("Profile data must match the selected mode.")
                if not isinstance(item.get("name"), str) or not name or len(name) > 60:
                    raise ValueError("Profile name is required and must be 60 characters or fewer.")

                def required_text(field_name: str, label: str, maximum: int = 100) -> str:
                    raw_value = modern_data.get(field_name)
                    if not isinstance(raw_value, str):
                        raise ValueError(f"{label} is required and must be text.")
                    field_value = raw_value.strip()
                    if not field_value or len(field_value) > maximum:
                        raise ValueError(f"{label} is required and must be {maximum} characters or fewer.")
                    return field_value

                def required_number(field_name: str, label: str, *, positive: bool = False) -> float:
                    number_value = modern_data.get(field_name)
                    if isinstance(number_value, bool):
                        raise ValueError(f"{label} must be a valid number.")
                    try:
                        number = float(number_value)
                    except (TypeError, ValueError) as error:
                        raise ValueError(f"{label} must be a valid number.") from error
                    if not math.isfinite(number) or number < 0 or (positive and number == 0):
                        qualifier = "greater than 0" if positive else "non-negative"
                        raise ValueError(f"{label} must be {qualifier}.")
                    return number

                if profile_type == "backtesting":
                    pair = required_text("pair", "Pair", 40)
                    date_from = required_text("date_from", "Date From", 10)
                    date_to = required_text("date_to", "Date To", 10)
                    try:
                        start_date = datetime.strptime(date_from, "%Y-%m-%d").date()
                        end_date = datetime.strptime(date_to, "%Y-%m-%d").date()
                    except ValueError as error:
                        raise ValueError("Date From and Date To must be valid ISO dates.") from error
                    if start_date.isoformat() != date_from or end_date.isoformat() != date_to:
                        raise ValueError("Date From and Date To must be valid ISO dates.")
                    if end_date < start_date:
                        raise ValueError("Date To must be on or after Date From.")
                    data = {
                        "pair": pair,
                        "date_from": date_from,
                        "date_to": date_to,
                        "capital": required_number("capital", "Capital", positive=True),
                    }
                elif profile_type == "broker":
                    data = {
                        "broker_name": required_text("broker_name", "Broker Name"),
                        "capital": required_number("capital", "Capital", positive=True),
                    }
                else:
                    phase = modern_data.get("phase")
                    if not isinstance(phase, str) or phase not in {"Phase 1", "Phase 2", "Master Account"}:
                        raise ValueError("Phase must be Phase 1, Phase 2, or Master Account.")
                    data = {
                        "firm_name": required_text("firm_name", "Prop Firm Name"),
                        "capital": required_number("capital", "Capital", positive=True),
                        "daily_drawdown_pct": required_number("daily_drawdown_pct", "DD (Max Daily Drawdown)"),
                        "max_drawdown_pct": required_number("max_drawdown_pct", "Max DD (Max Total Drawdown)"),
                        "target_pct": required_number("target_pct", "Target"),
                        "phase": phase,
                    }

                if name.casefold() in profile_names:
                    raise ValueError(f"A profile named '{name}' already exists.")
                profile_names.add(name.casefold())
                profile_id = str(item.get("id") or uuid.uuid4().hex)
                if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", profile_id):
                    raise ValueError("Backtesting profile IDs may contain only letters, numbers, _ and -.")
                if profile_id in profile_ids:
                    raise ValueError("Backtesting profile IDs must be unique.")
                profile_ids.add(profile_id)
                profiles.append({
                    "id": profile_id,
                    "type": profile_type,
                    "name": name,
                    "created_at": str(item.get("created_at") or datetime.now().astimezone().isoformat()),
                    mode_key: data,
                    **access,
                })
                continue

            strategy = str(item.get("strategy", "")).strip()
            broker = str(item.get("broker", "")).strip()
            prop_firm = str(item.get("prop_firm", "")).strip()
            if not name or len(name) > 60:
                raise ValueError("Profile name is required and must be 60 characters or fewer.")
            for label, field in (
                ("Strategy", strategy),
                ("Broker", broker),
                ("Prop firm", prop_firm),
            ):
                if len(field) > 100:
                    raise ValueError(f"{label} must be 100 characters or fewer.")
            capital_value = item.get("capital")
            if capital_value in ("", None):
                capital = None
            else:
                if isinstance(capital_value, bool):
                    raise ValueError("Starting capital must be a non-negative number.")
                try:
                    capital = float(capital_value)
                except (TypeError, ValueError) as error:
                    raise ValueError("Starting capital must be a non-negative number.") from error
                if not math.isfinite(capital) or capital < 0:
                    raise ValueError("Starting capital must be a non-negative number.")
            if name.casefold() in profile_names:
                raise ValueError(f"A profile named '{name}' already exists.")
            profile_names.add(name.casefold())

            profile_id = str(item.get("id") or uuid.uuid4().hex)
            if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", profile_id):
                raise ValueError("Backtesting profile IDs may contain only letters, numbers, _ and -.")
            if profile_id in profile_ids:
                raise ValueError("Backtesting profile IDs must be unique.")
            profile_ids.add(profile_id)
            profiles.append(
                {
                    "id": profile_id,
                    "type": profile_type,
                    "name": name,
                    "capital": capital,
                    "strategy": strategy,
                    "broker": broker,
                    "prop_firm": prop_firm,
                    **access,
                }
            )

        active_profile_id = value.get("active_profile_id")
        if active_profile_id is not None:
            active_profile_id = str(active_profile_id)
            if active_profile_id not in profile_ids:
                raise ValueError("The active profile must be one of the saved profiles.")
        return {"profiles": profiles, "active_profile_id": active_profile_id}

    def load_backtesting_profiles(self) -> dict[str, Any]:
        try:
            value = json.loads(
                self.backtesting_profiles_path.read_text(encoding="utf-8")
            )
        except (OSError, json.JSONDecodeError) as error:
            raise RuntimeError(f"Could not read backtesting profiles: {error}") from error
        return self.validate_backtesting_profiles(value)

    def save_backtesting_profiles(self, value: Any) -> dict[str, Any]:
        validated = self.validate_backtesting_profiles(value)
        with self._lock:
            marker = self.data_root / ".profile_data_migration.json"
            previous_profiles = self.load_backtesting_profiles()
            previous_profile_ids = {
                profile["id"] for profile in previous_profiles["profiles"]
            }
            previous_by_id = {
                profile["id"]: profile for profile in previous_profiles["profiles"]
            }
            incoming_by_id = {
                str(profile.get("id")): profile
                for profile in value["profiles"]
                if isinstance(profile, dict)
            }
            for profile in validated["profiles"]:
                incoming = incoming_by_id.get(profile["id"], {})
                code = incoming.get("access_code")
                method = incoming.get("access_method")
                if code is not None:
                    if not isinstance(code, str):
                        raise ValueError("Profile access code must be text.")
                    self._validate_profile_access_code(method, code)
                    profile["access_method"] = method
                    profile["access_hash"] = generate_password_hash(code, method="scrypt")
                elif profile["id"] in previous_by_id:
                    previous = previous_by_id[profile["id"]]
                    if previous.get("access_hash"):
                        profile["access_method"] = previous["access_method"]
                        profile["access_hash"] = previous["access_hash"]
            next_profile_ids = {
                profile["id"] for profile in validated["profiles"]
            }
            if not marker.exists() and validated["active_profile_id"]:
                old_active = previous_profiles["active_profile_id"]
                migration_profile_id = (
                    old_active
                    if old_active in next_profile_ids
                    else validated["active_profile_id"]
                )
                self._migrate_legacy_data(migration_profile_id)
            for profile_id in previous_profile_ids - next_profile_ids:
                profile_root = (
                    self.data_root
                    / "profiles"
                    / hashlib.sha256(profile_id.encode("utf-8")).hexdigest()
                )
                if profile_root.is_symlink():
                    profile_root.unlink()
                elif profile_root.exists():
                    shutil.rmtree(profile_root)
            self._write_json(self.backtesting_profiles_path, validated)
        return validated

    @staticmethod
    def _validate_profile_access_code(method: Any, code: str) -> None:
        if method == "pin":
            valid = code.isascii() and code.isdigit() and 6 <= len(code) <= 12
            requirement = "a 6–12 digit PIN"
        elif method == "passcode":
            valid = 6 <= len(code) <= 64
            requirement = "a 6–64 character passcode"
        elif method == "password":
            valid = 8 <= len(code) <= 128
            requirement = "an 8–128 character password"
        else:
            raise ValueError("Choose password, PIN, or passcode for profile access.")
        if not valid:
            raise ValueError(f"Use {requirement}.")

    def verify_profile_access(self, profile_id: str, code: str) -> bool:
        profile = next(
            (
                item for item in self.load_backtesting_profiles()["profiles"]
                if item["id"] == profile_id
            ),
            None,
        )
        return bool(
            profile
            and profile.get("access_hash")
            and isinstance(code, str)
            and check_password_hash(profile["access_hash"], code)
        )

    def set_profile_access(self, profile_id: str, method: str, code: str) -> dict[str, Any]:
        if not isinstance(method, str) or not isinstance(code, str):
            raise ValueError("Provide a valid profile access method and code.")
        self._validate_profile_access_code(method, code)
        state = self.load_backtesting_profiles()
        profile = next((item for item in state["profiles"] if item["id"] == profile_id), None)
        if profile is None:
            raise ValueError("Choose a saved profile.")
        if profile.get("access_hash"):
            raise ValueError("This profile already has an access code. Unlock it first.")
        profile["access_method"] = method
        profile["access_hash"] = generate_password_hash(code, method="scrypt")
        return self.save_backtesting_profiles(state)

    def create_backup(self, dest: Path | None = None, *, sync_to_drive: bool = True) -> Path:
        timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S_%f")
        destination = dest or self.backups_dir / f"backup_{timestamp}.zip"
        destination.parent.mkdir(parents=True, exist_ok=True)
        with self._lock:
            with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.write(self.trades_path, "trades.json")
                archive.write(self.config_path, "config.json")
                if self.profile_id is None:
                    archive.write(self.backtesting_profiles_path, "backtesting_profiles.json")
                for image in self.images_dir.rglob("*"):
                    if image.is_file():
                        archive.write(image, image.relative_to(self.root).as_posix())
        if dest is None:
            backups = sorted(
                self.backups_dir.glob("backup_*.zip"),
                key=lambda path: path.stat().st_mtime,
                reverse=True,
            )
            for old_backup in backups[10:]:
                old_backup.unlink()
        if sync_to_drive:
            self.sync_if_enabled(backup_path=destination)
        return destination

    def create_monthly_backup_if_due(self) -> Path | None:
        suffix = (
            f"_{hashlib.sha256(self.profile_id.encode('utf-8')).hexdigest()[:10]}"
            if self.profile_id is not None
            else ""
        )
        destination = self.backups_dir / f"monthly_backup{suffix}.zip"
        temporary = self.backups_dir / f".monthly_backup_{uuid.uuid4().hex}.tmp.zip"
        try:
            with self._lock:
                now = datetime.now().timestamp()
                previous_backup = (
                    destination.stat().st_mtime if destination.exists() else max(
                        (
                            path.stat().st_mtime
                            for path in self.backups_dir.glob(f"weekly_backup{suffix}*.zip")
                            if path.is_file()
                        ),
                        default=0,
                    )
                )
                if (
                    previous_backup
                    and now - previous_backup < MONTHLY_BACKUP_INTERVAL_SECONDS
                ):
                    return None
                self.create_backup(temporary, sync_to_drive=False)
                os.replace(temporary, destination)
        finally:
            temporary.unlink(missing_ok=True)
        self.sync_if_enabled(backup_path=destination)
        return destination

    def restore_backup(self, zip_path: Path) -> None:
        if zip_path.stat().st_size > MAX_RESTORE_SIZE:
            raise ValueError("Backup archive must be smaller than 250 MB.")
        with tempfile.TemporaryDirectory(prefix="trading-journal-restore-") as temp_dir:
            staging = Path(temp_dir)
            with zipfile.ZipFile(zip_path) as archive:
                entries: dict[str, zipfile.ZipInfo] = {}
                total_size = 0
                for info in archive.infolist():
                    name = info.filename
                    pure = PurePosixPath(name)
                    if (
                        pure.is_absolute()
                        or ".." in pure.parts
                        or "\\" in name
                        or (info.is_dir() and not name.startswith("images/"))
                        or not (
                            name in (
                                "trades.json",
                                "config.json",
                                "backtesting_profiles.json",
                            )
                            or name.startswith("images/")
                        )
                        or (info.external_attr >> 16) & 0o170000 == 0o120000
                    ):
                        raise ValueError("Backup contains an invalid file path.")
                    if info.is_dir():
                        continue
                    if name.startswith("images/"):
                        if len(pure.parts) != 2 or pure.suffix.lower() not in (".png", ".jpg", ".jpeg"):
                            raise ValueError("Backup contains an unsupported image file.")
                    if name in entries:
                        raise ValueError("Backup contains duplicate file entries.")
                    total_size += info.file_size
                    if total_size > MAX_RESTORE_SIZE:
                        raise ValueError("Backup expands beyond the 250 MB size limit.")
                    entries[name] = info
                if "trades.json" not in entries or "config.json" not in entries:
                    raise ValueError("Backup is missing trades.json or config.json.")
                for name, info in entries.items():
                    target = staging.joinpath(*PurePosixPath(name).parts)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(archive.read(info))
            try:
                trades = json.loads((staging / "trades.json").read_text(encoding="utf-8"))
                restored_config = json.loads((staging / "config.json").read_text(encoding="utf-8"))
                restored_profiles = (
                    json.loads((staging / "backtesting_profiles.json").read_text(encoding="utf-8"))
                    if "backtesting_profiles.json" in entries
                    else None
                )
            except (json.JSONDecodeError, UnicodeDecodeError) as error:
                raise ValueError(f"Backup JSON data is invalid: {error}") from error
            if not isinstance(trades, list) or any(not isinstance(trade, dict) for trade in trades):
                raise ValueError("Backup trade data is invalid.")
            if isinstance(restored_config, dict):
                restored_config = {
                    **restored_config,
                    "backup_directory": str(self.backups_dir),
                }
            config = self.validate_config(
                restored_config, default_backup_directory=self.root
            )
            profiles = (
                self.validate_backtesting_profiles(restored_profiles)
                if restored_profiles is not None and self.profile_id is None
                else None
            )
            for image_path in (staging / "images").rglob("*"):
                if not image_path.is_file():
                    continue
                try:
                    with Image.open(image_path) as image:
                        expected_format = "PNG" if image_path.suffix.lower() == ".png" else "JPEG"
                        if image.format != expected_format:
                            raise ValueError("Backup image extension does not match its content.")
                        image.verify()
                except (UnidentifiedImageError, OSError) as error:
                    raise ValueError(f"Backup contains an invalid image: {image_path.name}") from error
            self.create_backup()
            with self._lock:
                self._write_json(self.trades_path, trades)
                self._write_json(self.config_path, config)
                if profiles is not None:
                    self._write_json(self.backtesting_profiles_path, profiles)
                for image in self.images_dir.iterdir():
                    if image.is_file():
                        image.unlink()
                    else:
                        shutil.rmtree(image)
                staged_images = staging / "images"
                if staged_images.exists():
                    for image in staged_images.rglob("*"):
                        if image.is_file():
                            target = self.images_dir / image.relative_to(staged_images)
                            target.parent.mkdir(parents=True, exist_ok=True)
                            shutil.copy2(image, target)

    def get_download(self, relative_path: str) -> Path:
        if not isinstance(relative_path, str) or not relative_path:
            raise ValueError("A download path is required.")
        if re.fullmatch(
            r"backups/backup_\d{4}-\d{2}-\d{2}_\d{6}_\d{6}\.zip", relative_path
        ):
            backup_root = self.backups_dir.resolve()
            candidate = (self.backups_dir / PurePosixPath(relative_path).name).resolve()
            if not candidate.is_relative_to(backup_root) or not candidate.is_file():
                raise FileNotFoundError("The requested backup file was not found.")
            return candidate

        candidate = (self.root / relative_path).resolve()
        root = self.root.resolve()
        if not candidate.is_relative_to(root) or not candidate.is_file():
            raise FileNotFoundError("The requested file was not found in the data folder.")
        if candidate == self.token_path.resolve():
            raise ValueError("OAuth tokens cannot be downloaded.")
        return candidate

    def sync_if_enabled(self, backup_path: Path | None = None) -> None:
        config = self.load_config()
        if not config["google_sync"]["enabled"]:
            return
        from gdrive import is_connected, upload_file

        if not is_connected(self.data_root):
            return

        def upload() -> None:
            try:
                folder = config["google_sync"]["folder_name"]
                if self.profile_id is not None:
                    folder = f"{folder} - {self.profile_id}"
                upload_file(self.trades_path, "trades.json", self.data_root, folder)
                upload_file(self.config_path, "config.json", self.data_root, folder)
                for image in self.images_dir.rglob("*"):
                    if image.is_file():
                        drive_name = image.relative_to(self.images_dir).as_posix()
                        upload_file(image, drive_name, self.data_root, folder)
                if backup_path and backup_path.exists():
                    upload_file(backup_path, backup_path.name, self.data_root, folder)
            except (ImportError, OSError, ValueError, RuntimeError) as error:
                self.log_sync_error(str(error))

        threading.Thread(target=upload, name="journal-drive-sync", daemon=True).start()

    def log_sync_error(self, message: str) -> None:
        log_path = self.root / "sync_log.txt"
        with log_path.open("a", encoding="utf-8") as log:
            log.write(f"{datetime.now().isoformat(timespec='seconds')} {message}\n")


def create_backup_on_exit(backend: JournalBackend) -> None:
    global _auto_backup_done
    with _auto_backup_lock:
        if _auto_backup_done:
            return
        _auto_backup_done = True
    try:
        profiles = backend.load_backtesting_profiles()["profiles"]
        targets = (
            [backend]
            if not profiles
            else [
                _prepare_profile_backend(backend, profile["id"])
                for profile in profiles
            ]
        )
        for target in targets:
            try:
                if target.load_config()["auto_backup"]:
                    target.create_monthly_backup_if_due()
            except (OSError, RuntimeError, ValueError, zipfile.BadZipFile) as error:
                target.log_sync_error(f"Automatic backup failed: {error}")
    except (OSError, RuntimeError, ValueError, zipfile.BadZipFile) as error:
        backend.log_sync_error(f"Automatic backup failed: {error}")


def _prepare_profile_backend(backend: JournalBackend, profile_id: str) -> JournalBackend:
    backend.prepare_profile_data(profile_id)
    return backend.for_profile(profile_id)


def start_backup_scheduler(backend: JournalBackend) -> None:
    def run() -> None:
        while True:
            threading.Event().wait(60)
            try:
                profiles = backend.load_backtesting_profiles()["profiles"]
                targets = (
                    [("legacy", backend)]
                    if not profiles
                    else [
                        (
                            profile["id"],
                            _prepare_profile_backend(backend, profile["id"]),
                        )
                        for profile in profiles
                    ]
                )
                for _, target in targets:
                    if target.load_config()["auto_backup"]:
                        target.create_monthly_backup_if_due()
            except (OSError, RuntimeError, ValueError, zipfile.BadZipFile) as error:
                backend.log_sync_error(f"Scheduled backup failed: {error}")

    threading.Thread(target=run, name="journal-backup-scheduler", daemon=True).start()


def register_exit_backup(backend: JournalBackend) -> None:
    atexit.register(create_backup_on_exit, backend)
