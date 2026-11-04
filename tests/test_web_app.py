import base64
import csv
from contextlib import closing
import io
import json
import os
import sqlite3
import subprocess
import tempfile
import threading
import time
import types
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from app import create_app, load_desktop_webview, main, run_desktop
from backend import (
    MONTHLY_BACKUP_INTERVAL_SECONDS,
    JournalBackend,
    create_backup_on_exit,
    data_root,
)


class TradingJournalWebTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        (self.root / "trades.json").write_text("[]", encoding="utf-8")
        self.app = create_app(self.root, register_shutdown=False)
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    def tearDown(self):
        self.temp_dir.cleanup()

    def sample_trade(self, **overrides):
        trade = {
            "instrument": "ES",
            "date": "2026-10-31",
            "time": "09:30",
            "direction": "Long",
            "entry_price": 100,
            "exit_price": 110,
            "stop_loss": 95,
            "size": 2,
            "pnl": None,
            "custom_fields": {"Setup": "breakout", "Unknown": "ignored"},
        }
        trade.update(overrides)
        return trade

    def unlock_profile(self, profile_id, *, setup=False):
        response = self.client.post(
            f"/api/profile-access/{profile_id}",
            json={
                "action": "setup" if setup else "unlock",
                "method": "pin",
                "code": "123456",
            },
        )
        self.assertEqual(response.status_code, 200, response.get_json())
        return {
            "X-Trading-Profile-ID": profile_id,
            "X-Profile-Access-Token": response.get_json()["access_token"],
        }

    def test_create_trade_calculations_custom_fields_and_mode(self):
        self.client.post(
            "/api/config",
            json={
                "custom_fields": [{"name": "Setup", "type": "text"}],
                "google_sync": {"enabled": False, "folder_name": "TradingJournal"},
            },
        )

        response = self.client.post("/api/trades", json=self.sample_trade())

        self.assertEqual(response.status_code, 201)
        trade = response.get_json()
        self.assertEqual(trade["pnl"], 20)
        self.assertEqual(trade["r_multiple"], 2)
        self.assertEqual(trade["time"], "09:30:00")
        self.assertEqual(trade["custom_fields"], {"Setup": "breakout"})
        self.assertEqual(self.client.get("/api/mode").get_json()["mode"], "web")
        self.assertEqual(len(self.client.get("/api/trades").get_json()), 1)

    def test_profile_gate_precedes_hidden_dashboard_and_assets_are_served(self):
        dashboard = self.client.get("/")
        self.assertEqual(dashboard.status_code, 200)
        self.assertIn(b'id="profile-gate"', dashboard.data)
        self.assertIn(b'id="profile-gate-list"', dashboard.data)
        self.assertIn(b'id="profile-gate-form"', dashboard.data)
        self.assertIn(b'<div id="main-dashboard" hidden>', dashboard.data)
        self.assertIn(b"Trading profiles", dashboard.data)
        self.assertIn(b'id="profile-pair"', dashboard.data)
        self.assertIn(b'data-profile-custom-pair', dashboard.data)
        self.assertIn(b'id="profile-daily-dd"', dashboard.data)
        self.assertNotIn(b"id=\"profile-summary\"", dashboard.data)
        self.assertIn(b'id="edit-profile"', dashboard.data)
        self.assertIn(b'id="switch-profile"', dashboard.data)
        self.assertIn(b'id="profile-update-status"', dashboard.data)
        self.assertIn(b'class="brand-icon"', dashboard.data)
        self.assertIn(b'class="brand-trade">trade</span>', dashboard.data)
        self.assertIn(b'id="profile-update-detail"', dashboard.data)
        self.assertIn(b"/app.js?v=profile-access-scrypt-v17", dashboard.data)
        self.assertIn(b'id="profile-gate-access-method"', dashboard.data)
        self.assertIn(b'id="profile-access-delete"', dashboard.data)
        styles = self.client.get("/styles.css")
        app_js = self.client.get("/app.js")
        self.assertIn(b".trade-details-content.has-image", styles.data)
        self.assertIn(b"visiblePnl", app_js.data)
        self.assertIn(b"Updates are managed by the launcher", app_js.data)
        self.assertIn(b".brand-icon{display:flex;flex-direction:column", styles.data)
        self.assertIn(b".profile-update-indicator svg", styles.data)
        styles.close()
        app_js.close()
        self.assertIn(b"/chart.umd.js?v=equity-chart-journal-metrics-20261101", dashboard.data)
        self.assertIn(b"/date-fns.js?v=trade-calendar-20261101", dashboard.data)
        self.assertIn(b"/styles.css?v=profile-access-scrypt-v17", dashboard.data)
        self.assertIn(b'id="calendar-backtest-range"', dashboard.data)
        self.assertIn(b'id="trade-date-popover"', dashboard.data)
        self.assertIn(b'id="trade-date-month"', dashboard.data)
        self.assertIn(b'id="trade-date-grid"', dashboard.data)
        self.assertIn(b'<select name="direction" required><option value="">Select direction</option>', dashboard.data)
        self.assertIn(b'name="pnl" id="pnl" type="number" step="any" inputmode="decimal"', dashboard.data)
        self.assertIn(b'id="save-trade" disabled', dashboard.data)
        self.assertNotIn(b'name="entry_price" id="entry-price" type="number" step="any" min="0" placeholder="0.00" required', dashboard.data)
        self.assertIn(b'id="trade-calendar-grid"', dashboard.data)
        self.assertIn(b'id="calendar-total-trades"', dashboard.data)
        self.assertIn(b'id="calendar-month-select"', dashboard.data)
        self.assertIn(b'id="calendar-year-select"', dashboard.data)
        self.assertIn(b'id="calendar-trade-rows"', dashboard.data)
        self.assertIn(b">R-MULTIPLE</th>", dashboard.data)
        self.assertIn(b'id="calendar-clear-day"', dashboard.data)
        self.assertIn(b'id="profile-gate-type"', dashboard.data)
        self.assertIn(b'id="profile-gate-capital"', dashboard.data)
        self.assertNotIn(b'id="profile-strategy"', dashboard.data)
        self.assertIn(b'id="mode-dashboard"', dashboard.data)
        self.assertIn(b'id="cancel-profile-edit"', dashboard.data)
        self.assertIn(b'id="dashboard-view-content"', dashboard.data)
        dashboard.close()
        script = self.client.get("/app.js")
        self.assertEqual(script.status_code, 200)
        self.assertIn(b"syncJournalPair", script.data)
        self.assertIn(b"FEATURED_PAIRS", script.data)
        self.assertIn(b"Pair: \"LINK/USD\"", script.data)
        self.assertIn(b"curated pairs", script.data)
        self.assertIn(b"Target: ${targetReached ? \"Reached\" : \"In progress\"}", script.data)
        self.assertNotIn(b'["Target", Math.min(Math.round(targetProgress), 100)]', script.data)
        self.assertIn(b"renderTradeCalendar", script.data)
        self.assertIn(b"renderCalendarTradeList", script.data)
        self.assertIn(b"calendarSelectedDay", script.data)
        self.assertNotIn(b"mockOpenPnlByProfile", script.data)
        self.assertIn(b"const roundedOpenPnl = 0;", script.data)
        script.close()
        chart = self.client.get("/chart.umd.js")
        self.assertEqual(chart.status_code, 200)
        chart.close()
        date_utils = self.client.get("/date-fns.js")
        self.assertEqual(date_utils.status_code, 200)
        date_utils.close()
        stylesheet = self.client.get("/styles.css")
        self.assertEqual(stylesheet.status_code, 200)
        stylesheet.close()

    def test_update_check_reports_current_version_from_trusted_main(self):
        repository_root = str(Path(__file__).resolve().parents[1])
        results = [
            subprocess.CompletedProcess([], 0, stdout=repository_root, stderr=""),
            subprocess.CompletedProcess([], 0, stdout="https://github.com/c01d43am/Trading-Journal.git", stderr=""),
            subprocess.CompletedProcess([], 0, stdout="main", stderr=""),
            subprocess.CompletedProcess([], 0, stdout="", stderr=""),
            subprocess.CompletedProcess([], 0, stdout="", stderr=""),
            subprocess.CompletedProcess([], 0, stdout="0", stderr=""),
        ]
        with patch("app.subprocess.run", side_effect=results):
            response = self.client.post("/api/update/check")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["status"], "current")

    def test_update_check_reports_launcher_managed_for_packaged_app(self):
        with patch("app.sys.frozen", True, create=True):
            response = self.client.post("/api/update/check")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["status"], "launcher_managed")
        self.assertIn("rebuilds the packaged app", response.get_json()["message"])

    def test_update_check_does_not_overwrite_local_changes(self):
        repository_root = str(Path(__file__).resolve().parents[1])
        results = [
            subprocess.CompletedProcess([], 0, stdout=repository_root, stderr=""),
            subprocess.CompletedProcess([], 0, stdout="https://github.com/c01d43am/Trading-Journal.git", stderr=""),
            subprocess.CompletedProcess([], 0, stdout="main", stderr=""),
            subprocess.CompletedProcess([], 0, stdout="", stderr=""),
            subprocess.CompletedProcess([], 0, stdout="", stderr=""),
            subprocess.CompletedProcess([], 0, stdout="2", stderr=""),
            subprocess.CompletedProcess([], 0, stdout=" M required/app.py\n", stderr=""),
        ]
        with patch("app.subprocess.run", side_effect=results) as run_git:
            response = self.client.post("/api/update/check")

        self.assertEqual(response.status_code, 409)
        self.assertIn("local source changes", response.get_json()["error"])
        self.assertFalse(any(call.args[0][1] == "merge" for call in run_git.call_args_list))

    def test_pair_catalog_is_served_for_web_combobox(self):
        response = self.client.get("/all_pairs.json")

        self.assertEqual(response.status_code, 200)
        pairs = response.get_json()
        source_path = Path(__file__).resolve().parents[1] / "Market Data" / "all_pairs.csv"
        with source_path.open(encoding="utf-8-sig", newline="") as source_file:
            csv_pairs = list(csv.reader(source_file))
        market_path = source_path.with_name("all_pairs.txt")
        with market_path.open(encoding="utf-8-sig", newline="") as market_file:
            market_rows = csv.DictReader(market_file, delimiter="\t")
            markets_by_pair = {row["Pair"].strip(): row["Market"].strip() for row in market_rows}
        source_pairs = [
            {"Market": markets_by_pair[pair.strip()], "Pair": pair.strip(), "Name": name.strip()}
            for pair, name in csv_pairs
        ]

        self.assertEqual(pairs, source_pairs)
        self.assertEqual(len(pairs), 2155)
        self.assertTrue(any(pair["Market"] == "Forex" and pair["Pair"] == "AED/AUD" for pair in pairs))
        self.assertTrue(any(pair["Market"] == "Crypto" and pair["Pair"] == "BTC/USD" for pair in pairs))
        self.assertTrue(any(pair["Market"] == "Stocks" for pair in pairs))
        self.assertEqual({pair["Market"] for pair in pairs}, {"Forex", "Crypto", "Stocks"})
        response.close()

    def test_negative_pnl_is_saved_and_loaded(self):
        response = self.client.post(
            "/api/trades",
            json=self.sample_trade(exit_price=90, pnl=None),
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json()["pnl"], -20)
        self.assertEqual(self.client.get("/api/trades").get_json()[0]["pnl"], -20)

    def test_manual_pnl_saves_with_empty_optional_values(self):
        response = self.client.post(
            "/api/trades",
            json=self.sample_trade(
                entry_price="",
                exit_price="",
                stop_loss="",
                take_profit="",
                size="",
                pnl=-2,
            ),
        )

        self.assertEqual(response.status_code, 201)
        trade = response.get_json()
        self.assertEqual(trade["pnl"], -2)
        self.assertIsNone(trade["entry_price"])
        self.assertIsNone(trade["exit_price"])
        self.assertIsNone(trade["stop_loss"])
        self.assertIsNone(trade["take_profit"])
        self.assertIsNone(trade["size"])
        self.assertIsNone(trade["r_multiple"])

    def test_manual_pnl_is_required_when_prices_are_incomplete(self):
        response = self.client.post(
            "/api/trades",
            json=self.sample_trade(entry_price="", exit_price="", size="", pnl=None),
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("P&L is required", response.get_json()["error"])

    def test_backtesting_profiles_can_be_saved_selected_and_restored(self):
        first_profile = {
            "id": "london-breakout",
            "type": "backtesting",
            "name": "London breakout",
            "capital": 10000,
            "strategy": "Opening range breakout",
            "broker": "Broker One",
            "prop_firm": "Firm One",
        }
        second_profile = {
            "id": "ny-vwap",
            "type": "broker",
            "name": "NY VWAP",
            "capital": None,
            "strategy": "VWAP pullback",
            "broker": "Broker Two",
            "prop_firm": "Firm Two",
        }
        initial = {
            "profiles": [first_profile, second_profile],
            "active_profile_id": second_profile["id"],
        }

        saved = self.client.post("/api/backtesting-profiles", json=initial)
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.get_json(), initial)
        self.assertEqual(self.client.get("/api/backtesting-profiles").get_json(), initial)

        backend = self.app.extensions["journal_backend"]
        backup_path = backend.create_backup(sync_to_drive=False)
        with zipfile.ZipFile(backup_path) as archive:
            self.assertIn("backtesting_profiles.json", archive.namelist())

        deleted = self.client.post(
            "/api/profile-access/ny-vwap",
            json={"action": "delete", "confirm_name": "NY VWAP"},
        )
        self.assertEqual(deleted.status_code, 200)
        changed = {
            "profiles": [first_profile],
            "active_profile_id": first_profile["id"],
        }
        self.assertEqual(
            self.client.post("/api/backtesting-profiles", json=changed).status_code,
            200,
        )
        backend.restore_backup(backup_path)
        reopened = JournalBackend(self.root)
        self.assertEqual(reopened.load_backtesting_profiles(), initial)

    def test_profile_access_is_scrypt_hashed_and_required_for_profile_data(self):
        profile = {
            "id": "secured-profile",
            "type": "broker",
            "name": "Secured profile",
            "broker": {"broker_name": "Local broker", "capital": 1000},
            "access_method": "pin",
            "access_code": "123456",
        }
        created = self.client.post(
            "/api/backtesting-profiles",
            json={"profiles": [profile], "active_profile_id": profile["id"]},
        )
        self.assertEqual(created.status_code, 200)
        profile_state = created.get_json()["profiles"][0]
        self.assertTrue(profile_state["access_configured"])
        self.assertNotIn("access_hash", profile_state)
        self.assertNotIn("access_code", profile_state)
        saved = self.app.extensions["journal_backend"].load_backtesting_profiles()["profiles"][0]
        self.assertTrue(saved["access_hash"].startswith("scrypt:"))
        self.assertNotIn("123456", json.dumps(saved))

        self.assertEqual(self.client.get("/api/trades").status_code, 401)
        bad_unlock = self.client.post(
            "/api/profile-access/secured-profile",
            json={"action": "unlock", "code": "000000"},
        )
        self.assertEqual(bad_unlock.status_code, 401)
        changed_profile = dict(profile_state)
        changed_profile["broker"] = {"broker_name": "Tampered", "capital": 1000}
        tamper = self.client.post(
            "/api/backtesting-profiles",
            json={
                "profiles": [changed_profile],
                "active_profile_id": "secured-profile",
            },
        )
        self.assertEqual(tamper.status_code, 401)
        unlocked = self.client.post(
            "/api/profile-access/secured-profile",
            json={"action": "unlock", "code": "123456"},
        )
        self.assertEqual(unlocked.status_code, 200)
        access_token = unlocked.get_json()["access_token"]
        headers = {
            "X-Trading-Profile-ID": "secured-profile",
            "X-Profile-Access-Token": access_token,
        }
        self.assertEqual(self.client.get("/api/trades", headers=headers).status_code, 200)
        self.assertEqual(self.client.get("/api/trades").status_code, 200)
        self.assertIn("HttpOnly", unlocked.headers.get("Set-Cookie", ""))
        reset_code = dict(profile_state, access_code="654321")
        self.assertEqual(
            self.client.post(
                "/api/backtesting-profiles",
                json={
                    "profiles": [reset_code],
                    "active_profile_id": "secured-profile",
                },
                headers=headers,
            ).status_code,
            400,
        )
        profiles_state = self.client.get("/api/backtesting-profiles").get_json()
        profiles_state["profiles"].append(
            {
                "id": "second-profile",
                "type": "broker",
                "name": "Second profile",
                "broker": {"broker_name": "Other broker", "capital": 1000},
            }
        )
        self.assertEqual(
            self.client.post(
                "/api/backtesting-profiles", json=profiles_state
            ).status_code,
            200,
        )
        self.unlock_profile("second-profile", setup=True)
        relocked = self.client.post(
            "/api/profile-access/secured-profile",
            json={"action": "unlock", "code": "123456"},
        )
        self.assertEqual(relocked.status_code, 200)
        self.assertEqual(self.client.get("/api/trades", headers=headers).status_code, 401)
        relocked_headers = {
            "X-Trading-Profile-ID": "secured-profile",
            "X-Profile-Access-Token": relocked.get_json()["access_token"],
        }
        self.assertEqual(
            self.client.get("/api/trades", headers=relocked_headers).status_code, 200
        )

    def test_profile_types_allow_optional_details_and_capital(self):
        profile = {
            "id": "prop-firm-account",
            "type": "prop_firm",
            "name": "FTMO 100K",
            "capital": 100000,
            "strategy": "",
            "broker": "",
            "prop_firm": "FTMO",
        }
        response = self.client.post(
            "/api/backtesting-profiles",
            json={"profiles": [profile], "active_profile_id": profile["id"]},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["profiles"][0], profile)
        headers = self.unlock_profile(profile["id"], setup=True)

        invalid_capital = {
            **profile,
            "capital": -1,
        }
        response = self.client.post(
            "/api/backtesting-profiles",
            json={"profiles": [invalid_capital], "active_profile_id": profile["id"]},
            headers=headers,
        )
        self.assertEqual(response.status_code, 400)

    def test_mode_profiles_require_exact_mode_specific_data(self):
        profiles = [
            {
                "id": "backtest-required",
                "type": "backtesting",
                "name": "EURUSD historical",
                "created_at": "2026-11-01T10:00:00+05:30",
                "backtesting": {
                    "pair": "EURUSD",
                    "date_from": "2025-01-01",
                    "date_to": "2025-12-31",
                    "capital": 10000,
                },
            },
            {
                "id": "prop-firm-required",
                "type": "prop_firm",
                "name": "Firm evaluation",
                "prop_firm": {
                    "firm_name": "Example Firm",
                    "capital": 50000,
                    "daily_drawdown_pct": 5,
                    "max_drawdown_pct": 10,
                    "target_pct": 8,
                    "phase": "Phase 1",
                },
            },
            {
                "id": "broker-required",
                "type": "broker",
                "name": "Main broker",
                "broker": {"broker_name": "Example Broker", "capital": 25000},
            },
        ]
        result = self.client.post(
            "/api/backtesting-profiles",
            json={"profiles": profiles, "active_profile_id": profiles[0]["id"]},
        )
        self.assertEqual(result.status_code, 200)
        saved = result.get_json()["profiles"]
        self.assertEqual([profile["type"] for profile in saved], ["backtesting", "prop_firm", "broker"])
        self.assertEqual(
            set(saved[0]["backtesting"]),
            {"pair", "date_from", "date_to", "capital"},
        )
        self.assertEqual(
            set(saved[1]["prop_firm"]),
            {"firm_name", "capital", "daily_drawdown_pct", "max_drawdown_pct", "target_pct", "phase"},
        )
        self.assertEqual(set(saved[2]["broker"]), {"broker_name", "capital"})

        invalid_backtest = {
            **profiles[0],
            "id": "missing-pair",
            "backtesting": {**profiles[0]["backtesting"], "pair": ""},
        }
        response = self.client.post(
            "/api/backtesting-profiles",
            json={"profiles": [invalid_backtest], "active_profile_id": invalid_backtest["id"]},
        )
        self.assertEqual(response.status_code, 400)

        invalid_dates = {
            **profiles[0],
            "id": "invalid-dates",
            "backtesting": {**profiles[0]["backtesting"], "date_from": "2026-01-01"},
        }
        response = self.client.post(
            "/api/backtesting-profiles",
            json={"profiles": [invalid_dates], "active_profile_id": invalid_dates["id"]},
        )
        self.assertEqual(response.status_code, 400)

        invalid_phase = {
            **profiles[1],
            "id": "invalid-phase",
            "prop_firm": {**profiles[1]["prop_firm"], "phase": "Funded"},
        }
        response = self.client.post(
            "/api/backtesting-profiles",
            json={"profiles": [invalid_phase], "active_profile_id": invalid_phase["id"]},
        )
        self.assertEqual(response.status_code, 400)

        mixed_mode = {
            **profiles[0],
            "id": "mixed-mode",
            "broker": {"broker_name": "Unexpected", "capital": 1000},
        }
        response = self.client.post(
            "/api/backtesting-profiles",
            json={"profiles": [mixed_mode], "active_profile_id": mixed_mode["id"]},
        )
        self.assertEqual(response.status_code, 400)

    def test_backtesting_journal_rejects_trades_outside_profile_range(self):
        profile = {
            "id": "range-limited",
            "type": "backtesting",
            "name": "Range test",
            "created_at": "2026-11-01T10:00:00Z",
            "backtesting": {
                "pair": "EURUSD",
                "date_from": "2026-10-01",
                "date_to": "2026-10-31",
                "capital": 100,
            },
        }
        response = self.client.post(
            "/api/backtesting-profiles",
            json={"profiles": [profile], "active_profile_id": profile["id"]},
        )
        self.assertEqual(response.status_code, 200)

        headers = self.unlock_profile(profile["id"], setup=True)
        outside = self.client.post(
            "/api/trades",
            json=self.sample_trade(date="2026-11-01"),
            headers=headers,
        )
        self.assertEqual(outside.status_code, 400)
        self.assertIn("backtesting profile date range", outside.get_json()["error"])
        self.assertEqual(self.client.get("/api/trades", headers=headers).get_json(), [])

        inside = self.client.post(
            "/api/trades",
            json=self.sample_trade(date="2026-10-31"),
            headers=headers,
        )
        self.assertEqual(inside.status_code, 201)
        self.assertEqual(
            [trade["date"] for trade in self.client.get("/api/trades", headers=headers).get_json()],
            ["2026-10-31"],
        )

    def test_broker_and_prop_firm_accept_trades_outside_backtest_dates(self):
        profiles = [
            {
                "id": "broker-any-date",
                "type": "broker",
                "name": "Broker",
                "broker": {"broker_name": "Example", "capital": 1000},
            },
            {
                "id": "prop-firm-any-date",
                "type": "prop_firm",
                "name": "Prop firm",
                "prop_firm": {
                    "firm_name": "Example",
                    "capital": 10000,
                    "daily_drawdown_pct": 5,
                    "max_drawdown_pct": 10,
                    "target_pct": 8,
                    "phase": "Phase 1",
                },
            },
        ]
        result = self.client.post(
            "/api/backtesting-profiles",
            json={"profiles": profiles, "active_profile_id": profiles[0]["id"]},
        )
        self.assertEqual(result.status_code, 200)
        for profile in profiles:
            self.unlock_profile(profile["id"], setup=True)

        for profile, date in zip(profiles, ("2099-12-31", "1900-01-01")):
            headers = self.unlock_profile(profile["id"])
            response = self.client.post(
                "/api/trades",
                json=self.sample_trade(date=date),
                headers=headers,
            )
            self.assertEqual(response.status_code, 201)
            self.assertEqual(response.get_json()["date"], date)

    def test_trades_and_settings_are_isolated_between_profiles(self):
        first_profile = {
            "id": "profile-one",
            "name": "First account",
            "strategy": "",
            "broker": "Broker One",
            "prop_firm": "",
        }
        second_profile = {
            "id": "profile-two",
            "name": "Second account",
            "strategy": "",
            "broker": "Broker Two",
            "prop_firm": "",
        }
        self.client.post(
            "/api/backtesting-profiles",
            json={
                "profiles": [first_profile, second_profile],
                "active_profile_id": first_profile["id"],
            },
        )
        first_headers = self.unlock_profile(first_profile["id"], setup=True)
        second_headers = self.unlock_profile(second_profile["id"], setup=True)

        first_headers = self.unlock_profile(first_profile["id"])
        first_trade = self.client.post(
            "/api/trades",
            json=self.sample_trade(instrument="BTC/EUR"),
            headers=first_headers,
        )
        self.assertEqual(first_trade.status_code, 201)
        first_config = self.client.post(
            "/api/config",
            json={"custom_fields": [{"name": "Setup", "type": "text"}]},
            headers=first_headers,
        )
        self.assertEqual(first_config.status_code, 200)
        image_buffer = io.BytesIO()
        Image.new("RGB", (4, 4), "purple").save(image_buffer, format="PNG")
        uploaded_image = self.client.post(
            "/api/upload_image",
            json={
                "image_base64": "data:image/png;base64,"
                + base64.b64encode(image_buffer.getvalue()).decode("ascii")
            },
            headers=first_headers,
        )
        self.assertEqual(uploaded_image.status_code, 200)
        image_url = uploaded_image.get_json()["path"].removeprefix("images/")

        second_headers = self.unlock_profile(second_profile["id"])
        self.assertEqual(self.client.get("/api/trades", headers=second_headers).get_json(), [])
        self.assertEqual(
            self.client.get("/api/config", headers=second_headers).get_json()["custom_fields"],
            [],
        )
        first_headers = self.unlock_profile(first_profile["id"])
        self.assertEqual(
            len(self.client.get("/api/trades", headers=first_headers).get_json()),
            1,
        )
        self.assertEqual(
            self.client.get("/api/config", headers=first_headers).get_json()["custom_fields"],
            [{"name": "Setup", "type": "text"}],
        )
        first_image = self.client.get(
            f"/api/images/{image_url}?profile_id={first_profile['id']}",
            headers=first_headers,
        )
        second_image = self.client.get(
            f"/api/images/{image_url}?profile_id={second_profile['id']}",
            headers=first_headers,
        )
        self.assertEqual(first_image.status_code, 200)
        self.assertEqual(second_image.status_code, 401)
        first_image.close()
        second_image.close()

    def test_legacy_journal_data_is_assigned_only_to_existing_active_profile(self):
        legacy_trade = self.sample_trade(id="legacy-trade")
        (self.root / "trades.json").write_text(
            json.dumps([legacy_trade]), encoding="utf-8"
        )
        first_profile = {
            "id": "legacy-owner",
            "name": "Legacy owner",
            "strategy": "",
            "broker": "",
            "prop_firm": "",
        }
        second_profile = {
            "id": "empty-profile",
            "name": "Empty profile",
            "strategy": "",
            "broker": "",
            "prop_firm": "",
        }
        self.client.post(
            "/api/backtesting-profiles",
            json={
                "profiles": [first_profile, second_profile],
                "active_profile_id": first_profile["id"],
            },
        )
        first_headers = self.unlock_profile(first_profile["id"], setup=True)
        second_headers = self.unlock_profile(second_profile["id"], setup=True)
        first_headers = self.unlock_profile(first_profile["id"])
        self.assertEqual(
            self.client.get("/api/trades", headers=first_headers).get_json(),
            [legacy_trade],
        )

        second_headers = self.unlock_profile(second_profile["id"])
        self.assertEqual(self.client.get("/api/trades", headers=second_headers).get_json(), [])
        first_headers = self.unlock_profile(first_profile["id"])
        self.assertEqual(
            self.client.get("/api/trades", headers=first_headers).get_json(),
            [legacy_trade],
        )

    def test_profile_request_rejects_unknown_profile_id(self):
        profile = {
            "id": "profile-not-active",
            "name": "Unselected profile",
            "strategy": "",
            "broker": "",
            "prop_firm": "",
        }
        self.client.post(
            "/api/backtesting-profiles",
            json={"profiles": [profile], "active_profile_id": None},
        )
        self.assertEqual(self.client.get("/api/trades").status_code, 400)
        response = self.client.get(
            "/api/trades",
            headers={"X-Trading-Profile-ID": "not-a-saved-profile"},
        )
        self.assertEqual(response.status_code, 400)

    def test_profile_backups_contain_only_profile_data(self):
        first_profile = {
            "id": "backup-profile-one",
            "name": "First backup",
            "strategy": "",
            "broker": "",
            "prop_firm": "",
        }
        second_profile = {
            "id": "backup-profile-two",
            "name": "Second backup",
            "strategy": "",
            "broker": "",
            "prop_firm": "",
        }
        self.client.post(
            "/api/backtesting-profiles",
            json={
                "profiles": [first_profile, second_profile],
                "active_profile_id": first_profile["id"],
            },
        )
        first_headers = self.unlock_profile(first_profile["id"], setup=True)
        self.client.post(
            "/api/trades",
            json=self.sample_trade(instrument="ES"),
            headers=first_headers,
        )
        second_headers = self.unlock_profile(second_profile["id"], setup=True)
        self.client.post(
            "/api/trades",
            json=self.sample_trade(instrument="NQ"),
            headers=second_headers,
        )
        backup = self.app.extensions["journal_backend"].for_profile(first_profile["id"]).create_backup()
        with zipfile.ZipFile(backup) as archive:
            trades = json.loads(archive.read("trades.json"))
            self.assertEqual([trade["instrument"] for trade in trades], ["ES"])
            self.assertNotIn("backtesting_profiles.json", archive.namelist())

    def test_deleting_profile_removes_all_profile_data(self):
        profile = {
            "id": "deleted-profile",
            "name": "Profile to delete",
            "strategy": "",
            "broker": "",
            "prop_firm": "",
        }
        self.client.post(
            "/api/backtesting-profiles",
            json={"profiles": [profile], "active_profile_id": profile["id"]},
        )
        headers = self.unlock_profile(profile["id"], setup=True)
        self.client.post("/api/trades", json=self.sample_trade(), headers=headers)
        self.client.post(
            "/api/config",
            json={"custom_fields": [{"name": "Setup", "type": "text"}]},
            headers=headers,
        )

        backend = self.app.extensions["journal_backend"]
        profile_backend = backend.for_profile(profile["id"])
        (profile_backend.images_dir / "trade.png").write_bytes(b"image data")
        backup_path = profile_backend.create_backup(sync_to_drive=False)
        profile_root = profile_backend.root
        self.assertTrue(profile_root.exists())
        self.assertTrue(backup_path.exists())

        response = self.client.post(
            "/api/profile-access/deleted-profile",
            json={"action": "delete", "confirm_name": "Profile to delete"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(profile_root.exists())
        self.assertEqual(
            self.client.get("/api/trades", headers=headers).status_code,
            400,
        )

    def test_legacy_profiles_default_to_backtesting_type_without_capital(self):
        legacy_profile = {
            "id": "legacy-profile",
            "name": "Old setup",
            "strategy": "Momentum",
            "broker": "Broker",
            "prop_firm": "Firm",
        }
        response = self.client.post(
            "/api/backtesting-profiles",
            json={"profiles": [legacy_profile], "active_profile_id": legacy_profile["id"]},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["profiles"][0]["type"], "backtesting")
        self.assertIsNone(response.get_json()["profiles"][0]["capital"])

    def test_backtesting_profiles_reject_duplicate_names_and_invalid_active_id(self):
        profile = {
            "id": "profile-one",
            "name": "Scalp",
            "strategy": "Momentum",
            "broker": "Broker",
            "prop_firm": "Prop firm",
        }
        duplicate = {**profile, "id": "profile-two", "name": " scalp "}
        response = self.client.post(
            "/api/backtesting-profiles",
            json={"profiles": [profile, duplicate], "active_profile_id": profile["id"]},
        )
        self.assertEqual(response.status_code, 400)
        response = self.client.post(
            "/api/backtesting-profiles",
            json={"profiles": [profile], "active_profile_id": "missing"},
        )
        self.assertEqual(response.status_code, 400)

    def test_explicit_launch_modes_start_only_the_selected_view(self):
        with (
            patch("app.run_web_mode") as run_web,
            patch("app.run_desktop") as run_desktop,
        ):
            main(["--web"])
            run_web.assert_called_once_with(5000, open_browser=True)
            run_desktop.assert_not_called()

        with (
            patch("app.run_web_mode") as run_web,
            patch("app.run_desktop") as run_desktop,
        ):
            main(["--desktop"])
            run_desktop.assert_called_once_with()
            run_web.assert_not_called()

    def test_desktop_waits_for_lightweight_mode_endpoint(self):
        fake_server = types.SimpleNamespace(
            server_port=7789,
            serve_forever=lambda: None,
            shutdown=lambda: None,
            server_close=lambda: None,
        )
        fake_webview = types.SimpleNamespace(create_window=lambda *args, **kwargs: None, start=lambda: None)
        with (
            patch("app.load_desktop_webview", return_value=fake_webview),
            patch("app._register_runtime_handlers"),
            patch("werkzeug.serving.make_server", return_value=fake_server),
            patch("app.threading.Thread") as thread,
            patch("app._wait_for_server", return_value=True) as wait_for_server,
            patch.dict("app.os.environ", {}, clear=False),
        ):
            run_desktop()

        thread.return_value.start.assert_called_once_with()
        wait_for_server.assert_called_once_with("http://127.0.0.1:7789/api/mode")

    def test_local_server_readiness_check_bypasses_system_proxies(self):
        from werkzeug.serving import make_server

        server = make_server("127.0.0.1", 0, self.app, threaded=True)
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()
        try:
            with patch.dict(
                os.environ,
                {
                    "HTTP_PROXY": "http://127.0.0.1:1",
                    "HTTPS_PROXY": "http://127.0.0.1:1",
                    "ALL_PROXY": "http://127.0.0.1:1",
                    "NO_PROXY": "",
                    "no_proxy": "",
                },
                clear=False,
            ):
                from app import _wait_for_server

                self.assertTrue(
                    _wait_for_server(
                        f"http://127.0.0.1:{server.server_port}/api/mode",
                        timeout=2,
                    )
                )
        finally:
            server.shutdown()
            server.server_close()
            server_thread.join(timeout=1)

    def test_desktop_webview_loads_netfx_before_pywebview_on_windows(self):
        fake_webview = types.ModuleType("webview")
        with (
            patch("app.sys.platform", "win32"),
            patch.dict("app.os.environ", {}, clear=False),
            patch.dict("sys.modules", {"webview": fake_webview}),
            patch("pythonnet.load") as load_runtime,
        ):
            webview = load_desktop_webview()
            self.assertEqual(os.environ["PYTHONNET_RUNTIME"], "netfx")

        self.assertIs(webview, fake_webview)
        load_runtime.assert_called_once_with("netfx")

    def test_closing_launch_chooser_cancels_without_opening_a_view(self):
        with (
            patch("app.choose_launch_mode", return_value=None),
            patch("app.run_web_mode") as run_web,
            patch("app.run_desktop") as run_desktop,
        ):
            main(["--choose"])

        run_web.assert_not_called()
        run_desktop.assert_not_called()

    def test_source_and_packaged_modes_share_data_and_import_existing_source_trades(self):
        appdata = self.root / "roaming"
        legacy_root = self.root / "source-data"
        legacy_images = legacy_root / "images"
        legacy_images.mkdir(parents=True)
        image_buffer = io.BytesIO()
        Image.new("RGB", (4, 4), "orange").save(image_buffer, format="PNG")
        (legacy_images / "trade.png").write_bytes(image_buffer.getvalue())

        current_trade = {"id": "current-trade", "instrument": "NQ"}
        legacy_trade = {
            "id": "source-trade",
            "instrument": "ES",
            "image_file": "images/trade.png",
        }
        appdata.mkdir(parents=True)
        (appdata / "trades.json").write_text(json.dumps([current_trade]), encoding="utf-8")
        (legacy_root / "trades.json").write_text(json.dumps([legacy_trade]), encoding="utf-8")

        with (
            patch("backend.data_root", return_value=appdata),
            patch("backend._legacy_source_data_root", return_value=legacy_root),
        ):
            backend = JournalBackend()
            self.assertCountEqual(
                [trade["id"] for trade in backend.load_trades()],
                ["current-trade", "source-trade"],
            )
            reopened = JournalBackend()

        self.assertEqual(len(reopened.load_trades()), 2)
        self.assertTrue((appdata / "images" / "trade.png").is_file())
        self.assertEqual(json.loads((legacy_root / "trades.json").read_text(encoding="utf-8")), [legacy_trade])
        self.assertEqual((appdata / ".source_data_migrated").read_text(encoding="utf-8"), "complete\n")

    def test_data_root_is_shared_under_appdata(self):
        roaming = self.root / "roaming"
        with patch.dict(os.environ, {"APPDATA": str(roaming)}):
            self.assertEqual(data_root(), roaming / "TradingJournal" / "data")

    def test_exit_backup_rotates_one_zip_only_after_30_days(self):
        backend = self.app.extensions["journal_backend"]

        with patch("backend._auto_backup_done", False):
            create_backup_on_exit(backend)
        monthly_backup = self.root / "monthly_backup.zip"
        self.assertTrue(monthly_backup.is_file())
        initial_mtime = monthly_backup.stat().st_mtime

        with patch("backend._auto_backup_done", False):
            create_backup_on_exit(backend)
        self.assertEqual(monthly_backup.stat().st_mtime, initial_mtime)
        self.assertEqual(list(self.root.glob("monthly_backup*.zip")), [monthly_backup])

        backend._write_json(
            backend.trades_path,
            [{"id": "updated-trade", "instrument": "ES"}],
        )
        expired_mtime = time.time() - MONTHLY_BACKUP_INTERVAL_SECONDS - 1
        os.utime(monthly_backup, (expired_mtime, expired_mtime))
        with patch("backend._auto_backup_done", False):
            create_backup_on_exit(backend)

        self.assertGreater(monthly_backup.stat().st_mtime, initial_mtime)
        self.assertEqual(list(self.root.glob("monthly_backup*.zip")), [monthly_backup])
        with zipfile.ZipFile(monthly_backup) as archive:
            trades = json.loads(archive.read("trades.json"))
        self.assertEqual(trades[0]["id"], "updated-trade")
        self.assertEqual(list(self.root.glob(".monthly_backup_*.tmp.zip")), [])

    def test_monthly_backup_respects_recent_legacy_weekly_backup(self):
        backend = self.app.extensions["journal_backend"]
        legacy_backup = self.root / "weekly_backup.zip"
        with zipfile.ZipFile(legacy_backup, "w") as archive:
            archive.writestr("trades.json", "[]")

        self.assertIsNone(backend.create_monthly_backup_if_due())
        self.assertFalse((self.root / "monthly_backup.zip").exists())

    def test_image_upload_backup_download_and_safe_restore(self):
        image_buffer = io.BytesIO()
        Image.new("RGB", (4, 4), "green").save(image_buffer, format="PNG")
        encoded_image = base64.b64encode(image_buffer.getvalue()).decode("ascii")
        uploaded = self.client.post("/api/upload_image", json={"image_base64": encoded_image})
        self.assertEqual(uploaded.status_code, 200)
        image_path = uploaded.get_json()["path"]
        image_response = self.client.get(f"/api/{image_path}")
        self.assertEqual(image_response.status_code, 200)
        image_response.close()
        token_path = self.root / "google_token.json"
        token_path.write_text('{"refresh_token":"keep-local"}', encoding="utf-8")
        self.client.post("/api/trades", json=self.sample_trade(image_file=image_path))

        backup_response = self.client.post("/api/backup")
        backup_path = backup_response.get_json()["path"]
        download_response = self.client.get(f"/api/download?path={backup_path}")
        self.assertEqual(download_response.status_code, 200)
        with zipfile.ZipFile(io.BytesIO(download_response.data)) as archive:
            self.assertIn("trades.json", archive.namelist())
            self.assertIn("config.json", archive.namelist())
            self.assertIn(image_path, archive.namelist())
            self.assertNotIn("google_token.json", archive.namelist())
        backup_data = download_response.data
        download_response.close()

        self.client.delete("/api/trades/" + self.client.get("/api/trades").get_json()[0]["id"])
        restored = self.client.post(
            "/api/restore",
            data={"file": (io.BytesIO(backup_data), "journal.zip")},
            content_type="multipart/form-data",
        )
        self.assertEqual(restored.status_code, 200)
        self.assertEqual(len(restored.get_json()["trades"]), 1)
        self.assertEqual(len(list(self.root.glob("backup_*.zip"))), 2)
        self.assertEqual(json.loads(token_path.read_text(encoding="utf-8"))["refresh_token"], "keep-local")

    def test_backup_folder_defaults_to_data_folder_and_can_be_changed(self):
        config = self.client.get("/api/config").get_json()
        self.assertEqual(config["backup_directory"], str(self.root))

        selected_folder = self.root / "selected-backups"
        selected_folder.mkdir()
        with (
            patch("tkinter.Tk") as tk_root,
            patch("tkinter.filedialog.askdirectory", return_value=str(selected_folder)) as picker,
        ):
            response = self.client.post("/api/backup-folder")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["path"], str(selected_folder))
        picker.assert_called_once_with(
            parent=tk_root.return_value,
            initialdir=str(self.root),
            mustexist=True,
            title="Choose local backup folder",
        )
        tk_root.return_value.withdraw.assert_called_once_with()
        tk_root.return_value.destroy.assert_called_once_with()

        config["backup_directory"] = response.get_json()["path"]
        saved = self.client.post("/api/config", json=config)
        self.assertEqual(saved.status_code, 200)
        backup = self.client.post("/api/backup").get_json()
        self.assertTrue((selected_folder / Path(backup["path"]).name).is_file())
        downloaded = self.client.get(f"/api/download?path={backup['path']}")
        self.assertEqual(downloaded.status_code, 200)
        backup_data = downloaded.data
        downloaded.close()
        restored = self.client.post(
            "/api/restore",
            data={"file": (io.BytesIO(backup_data), "journal.zip")},
            content_type="multipart/form-data",
        )
        self.assertEqual(restored.status_code, 200)
        self.assertEqual(restored.get_json()["config"]["backup_directory"], str(selected_folder))

    def test_rejects_relative_backup_folder(self):
        response = self.client.post("/api/config", json={"backup_directory": "backups"})
        self.assertEqual(response.status_code, 400)
        response = self.client.post(
            "/api/config", json={"backup_directory": str(self.root / "images")}
        )
        self.assertEqual(response.status_code, 400)

    def test_rejects_bad_image_and_download_path_escape(self):
        self.assertEqual(
            self.client.post("/api/upload_image", json={"image_base64": "not-an-image"}).status_code,
            400,
        )
        self.assertEqual(self.client.get("/api/download?path=../../secret.txt").status_code, 404)

    def test_custom_field_config_validation(self):
        response = self.client.post(
            "/api/config",
            json={"custom_fields": [{"name": "Setup", "type": "unsupported"}]},
        )
        self.assertEqual(response.status_code, 400)

    def test_migrates_legacy_sqlite_trade_and_screenshot(self):
        legacy_root = self.root / "old-appdata"
        legacy_folder = legacy_root / "TradingJournal"
        screenshot_folder = legacy_folder / "screenshots"
        screenshot_folder.mkdir(parents=True)
        image_buffer = io.BytesIO()
        Image.new("RGB", (4, 4), "blue").save(image_buffer, format="PNG")
        (screenshot_folder / "before.png").write_bytes(image_buffer.getvalue())
        database_path = legacy_folder / "journal.sqlite3"
        with closing(sqlite3.connect(database_path)) as connection, connection:
            connection.execute(
                """
                CREATE TABLE trades (
                    id INTEGER PRIMARY KEY, instrument TEXT, direction TEXT, size REAL,
                    entry_date TEXT, exit_date TEXT, entry_price REAL, stop_loss REAL,
                    take_profit REAL, exit_price REAL, pnl REAL, setup_grade TEXT,
                    emotion INTEGER, notes TEXT, before_image TEXT, after_image TEXT,
                    created_at TEXT, updated_at TEXT
                )
                """
            )
            connection.execute(
                "INSERT INTO trades VALUES (1, 'ES', 'Long', 2, '2026-10-31T09:30:00', "
                "'2026-10-31T10:00:00', 100, 95, 110, 110, 20, 'A', 2, '', "
                "'before.png', NULL, '', '')"
            )
        previous_local_appdata = os.environ.get("LOCALAPPDATA")
        os.environ["LOCALAPPDATA"] = str(legacy_root)
        try:
            migrated = JournalBackend(self.root / "new-data").load_trades()
        finally:
            if previous_local_appdata is None:
                os.environ.pop("LOCALAPPDATA", None)
            else:
                os.environ["LOCALAPPDATA"] = previous_local_appdata
        self.assertEqual(len(migrated), 1)
        self.assertEqual(migrated[0]["date"], "2026-10-31")
        self.assertEqual(migrated[0]["time"], "09:30:00")
        self.assertEqual(migrated[0]["grade"], "A")
        self.assertEqual(migrated[0]["r_multiple"], 2)
        self.assertEqual(migrated[0]["image_file"], "images/before.png")
        self.assertTrue(database_path.is_file())

    def test_normalizes_previous_json_export_in_place(self):
        root = self.root / "previous-export"
        root.mkdir()
        (root / "trades.json").write_text(
            json.dumps([{
                "id": "old-1",
                "instrument": "NQ",
                "entry_date": "2026-10-31T14:15:00",
                "entry_price": 200,
                "exit_price": 210,
                "stop_loss": 195,
                "size": 1,
                "pnl": 10,
                "setup_grade": "B",
                "before_image": "images/setup.png",
                "custom_fields": {},
            }]),
            encoding="utf-8",
        )

        trade = JournalBackend(root).load_trades()[0]

        self.assertEqual(trade["date"], "2026-10-31")
        self.assertEqual(trade["time"], "14:15:00")
        self.assertEqual(trade["grade"], "B")
        self.assertEqual(trade["image_file"], "images/setup.png")
        self.assertEqual(trade["r_multiple"], 2)


if __name__ == "__main__":
    unittest.main()
