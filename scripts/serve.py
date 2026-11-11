#!/usr/bin/env python3
"""Lightweight local static server with SQLite (progress.db) persistence.

Uses only Python standard library modules (http.server + sqlite3).
Serves the repository root as a static website and exposes transactional
row-level /api/progress endpoints so progress persists safely across browser
cache clears, Incognito sessions, Chrome/Firefox, and multiple open tabs.
"""

import argparse
import functools
import json
import os
import sqlite3
import sys
import threading
import time
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

MAX_BODY_BYTES = 10 * 1024 * 1024  # 10 MB safety cap


class ProgressDatabase:
    """Thread-safe SQLite store for problem progress, notes, activity, and preferences."""

    def __init__(self, db_path: str):
        self.db_path = db_path
        self.lock = threading.Lock()
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10.0, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA busy_timeout=5000;")
        return conn

    def _init_schema(self):
        with self.lock:
            conn = self._connect()
            try:
                conn.execute("BEGIN")
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS problem_progress (
                        slug TEXT PRIMARY KEY,
                        solved INTEGER NOT NULL DEFAULT 0,
                        starred INTEGER NOT NULL DEFAULT 0,
                        note TEXT NOT NULL DEFAULT '',
                        solved_at INTEGER,
                        updated_at INTEGER NOT NULL
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS daily_activity (
                        date TEXT PRIMARY KEY,
                        count INTEGER NOT NULL DEFAULT 0
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS solve_history (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        slug TEXT NOT NULL,
                        solved_at INTEGER NOT NULL
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_solve_history_ts
                    ON solve_history (solved_at DESC, id DESC)
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS preferences (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL
                    )
                    """
                )
                conn.execute("COMMIT")
            except Exception:
                conn.execute("ROLLBACK")
                raise
            finally:
                conn.close()

    def is_empty(self) -> bool:
        with self.lock:
            conn = self._connect()
            try:
                for tbl in ("problem_progress", "daily_activity", "solve_history", "preferences"):
                    row = conn.execute(f"SELECT 1 FROM {tbl} LIMIT 1").fetchone()
                    if row is not None:
                        return False
                return True
            finally:
                conn.close()

    def migrate_json_file(self, json_path: str):
        """One-time migration if an older progress.json file exists and DB is empty."""
        if not os.path.exists(json_path) or not self.is_empty():
            return
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                self.replace_all(data)
                os.replace(json_path, f"{json_path}.migrated")
                print(f"Migrated legacy {json_path} -> {self.db_path}")
        except (OSError, json.JSONDecodeError) as exc:
            print(f"Warning: skipped migrating {json_path}: {exc}", file=sys.stderr)

    def read_all(self) -> dict:
        with self.lock:
            conn = self._connect()
            try:
                conn.execute("BEGIN")
                solved_slugs = []
                starred_slugs = []
                notes_by_slug = {}

                rows = conn.execute(
                    "SELECT slug, solved, starred, note FROM problem_progress"
                ).fetchall()
                for r in rows:
                    if r["solved"]:
                        solved_slugs.append(r["slug"])
                    if r["starred"]:
                        starred_slugs.append(r["slug"])
                    if r["note"]:
                        notes_by_slug[r["slug"]] = r["note"]

                activity = {}
                for r in conn.execute("SELECT date, count FROM daily_activity").fetchall():
                    if r["count"] > 0:
                        activity[r["date"]] = r["count"]

                recent_slugs = [
                    {"slug": r["slug"], "ts": r["solved_at"]}
                    for r in conn.execute(
                        "SELECT slug, solved_at FROM solve_history ORDER BY solved_at DESC, id DESC LIMIT 40"
                    ).fetchall()
                ]

                pref_row = conn.execute(
                    "SELECT value FROM preferences WHERE key = 'pinned_companies'"
                ).fetchone()
                pinned_companies = json.loads(pref_row["value"]) if pref_row else None

                has_data = bool(
                    rows or activity or recent_slugs or pref_row is not None
                )
                conn.execute("COMMIT")

                if not has_data:
                    return {"exists": False, "data": None}

                payload = {
                    "version": 3,
                    "solvedSlugs": solved_slugs,
                    "starredSlugs": starred_slugs,
                    "notesBySlug": notes_by_slug,
                    "recentSlugs": recent_slugs,
                    "activity": activity,
                }
                if isinstance(pinned_companies, list):
                    payload["pinnedCompanies"] = pinned_companies

                return {"exists": True, "data": payload}
            except Exception:
                conn.execute("ROLLBACK")
                raise
            finally:
                conn.close()

    def apply_patch(self, body: dict):
        action = body.get("action")
        now_ms = int(body.get("ts") or time.time() * 1000)

        with self.lock:
            conn = self._connect()
            try:
                conn.execute("BEGIN IMMEDIATE")

                if action == "solve":
                    slug = str(body.get("slug") or "").strip()
                    if not slug:
                        raise ValueError("Missing slug")
                    solved_int = 1 if body.get("solved") else 0
                    date_str = str(body.get("date") or "").strip()

                    existing = conn.execute(
                        "SELECT solved, starred, note FROM problem_progress WHERE slug = ?",
                        (slug,),
                    ).fetchone()
                    was_solved = bool(existing and existing["solved"])

                    conn.execute(
                        """
                        INSERT INTO problem_progress (slug, solved, starred, note, solved_at, updated_at)
                        VALUES (?, ?, 0, '', ?, ?)
                        ON CONFLICT(slug) DO UPDATE SET
                            solved = excluded.solved,
                            solved_at = CASE WHEN excluded.solved = 1 THEN excluded.solved_at ELSE solved_at END,
                            updated_at = excluded.updated_at
                        """,
                        (slug, solved_int, now_ms if solved_int else None, now_ms),
                    )

                    if solved_int == 1 and not was_solved:
                        if date_str:
                            conn.execute(
                                """
                                INSERT INTO daily_activity (date, count) VALUES (?, 1)
                                ON CONFLICT(date) DO UPDATE SET count = count + 1
                                """,
                                (date_str,),
                            )
                        conn.execute(
                            "DELETE FROM solve_history WHERE slug = ?", (slug,)
                        )
                        conn.execute(
                            "INSERT INTO solve_history (slug, solved_at) VALUES (?, ?)",
                            (slug, now_ms),
                        )

                    self._cleanup_empty_row(conn, slug)

                elif action == "star":
                    slug = str(body.get("slug") or "").strip()
                    if not slug:
                        raise ValueError("Missing slug")
                    starred_int = 1 if body.get("starred") else 0
                    conn.execute(
                        """
                        INSERT INTO problem_progress (slug, solved, starred, note, solved_at, updated_at)
                        VALUES (?, 0, ?, '', NULL, ?)
                        ON CONFLICT(slug) DO UPDATE SET
                            starred = excluded.starred,
                            updated_at = excluded.updated_at
                        """,
                        (slug, starred_int, now_ms),
                    )
                    self._cleanup_empty_row(conn, slug)

                elif action == "note":
                    slug = str(body.get("slug") or "").strip()
                    if not slug:
                        raise ValueError("Missing slug")
                    note_txt = str(body.get("note") or "").strip()
                    conn.execute(
                        """
                        INSERT INTO problem_progress (slug, solved, starred, note, solved_at, updated_at)
                        VALUES (?, 0, 0, ?, NULL, ?)
                        ON CONFLICT(slug) DO UPDATE SET
                            note = excluded.note,
                            updated_at = excluded.updated_at
                        """,
                        (slug, note_txt, now_ms),
                    )
                    self._cleanup_empty_row(conn, slug)

                elif action == "pinned":
                    pinned = body.get("pinnedCompanies")
                    if not isinstance(pinned, list):
                        raise ValueError("pinnedCompanies must be a list")
                    conn.execute(
                        """
                        INSERT INTO preferences (key, value) VALUES ('pinned_companies', ?)
                        ON CONFLICT(key) DO UPDATE SET value = excluded.value
                        """,
                        (json.dumps([str(x) for x in pinned]),),
                    )
                else:
                    raise ValueError(f"Unknown patch action: {action}")

                conn.execute("COMMIT")
            except Exception:
                conn.execute("ROLLBACK")
                raise
            finally:
                conn.close()

    @staticmethod
    def _cleanup_empty_row(conn: sqlite3.Connection, slug: str):
        conn.execute(
            "DELETE FROM problem_progress WHERE slug = ? AND solved = 0 AND starred = 0 AND note = ''",
            (slug,),
        )

    def replace_all(self, payload: dict):
        """Transactionally replace progress tables (used for initial seed, JSON import, or reset)."""
        now_ms = int(time.time() * 1000)
        is_reset = payload.get("action") == "reset"

        solved_set = set(str(s) for s in (payload.get("solvedSlugs") or []) if s)
        starred_set = set(str(s) for s in (payload.get("starredSlugs") or []) if s)
        notes_map = payload.get("notesBySlug") or {}
        if not isinstance(notes_map, dict):
            notes_map = {}

        recent_list = payload.get("recentSlugs") or []
        recent_ts_by_slug = {}
        for item in recent_list:
            if isinstance(item, dict) and item.get("slug"):
                recent_ts_by_slug[str(item["slug"])] = int(item.get("ts") or now_ms)

        all_slugs = solved_set | starred_set | {
            str(k) for k, v in notes_map.items() if str(v or "").strip()
        }

        activity = payload.get("activity") or {}
        pinned = payload.get("pinnedCompanies")

        with self.lock:
            conn = self._connect()
            try:
                conn.execute("BEGIN IMMEDIATE")
                conn.execute("DELETE FROM problem_progress")
                conn.execute("DELETE FROM daily_activity")
                conn.execute("DELETE FROM solve_history")

                if is_reset:
                    if isinstance(pinned, list):
                        conn.execute(
                            """
                            INSERT INTO preferences (key, value) VALUES ('pinned_companies', ?)
                            ON CONFLICT(key) DO UPDATE SET value = excluded.value
                            """,
                            (json.dumps([str(x) for x in pinned]),),
                        )
                    conn.execute("COMMIT")
                    return

                for slug in all_slugs:
                    s_flag = 1 if slug in solved_set else 0
                    st_flag = 1 if slug in starred_set else 0
                    n_txt = str(notes_map.get(slug) or "").strip()
                    s_ts = recent_ts_by_slug.get(slug) if s_flag else None
                    conn.execute(
                        """
                        INSERT INTO problem_progress (slug, solved, starred, note, solved_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (slug, s_flag, st_flag, n_txt, s_ts, now_ms),
                    )

                if isinstance(activity, dict):
                    for date_str, cnt in activity.items():
                        c_int = int(cnt or 0)
                        if c_int > 0:
                            conn.execute(
                                "INSERT INTO daily_activity (date, count) VALUES (?, ?)",
                                (str(date_str), c_int),
                            )

                for item in reversed(recent_list[:40]):
                    if isinstance(item, dict) and item.get("slug"):
                        conn.execute(
                            "INSERT INTO solve_history (slug, solved_at) VALUES (?, ?)",
                            (str(item["slug"]), int(item.get("ts") or now_ms)),
                        )

                if isinstance(pinned, list):
                    conn.execute(
                        """
                        INSERT INTO preferences (key, value) VALUES ('pinned_companies', ?)
                        ON CONFLICT(key) DO UPDATE SET value = excluded.value
                        """,
                        (json.dumps([str(x) for x in pinned]),),
                    )

                conn.execute("COMMIT")
            except Exception:
                conn.execute("ROLLBACK")
                raise
            finally:
                conn.close()


class ProgressRequestHandler(SimpleHTTPRequestHandler):
    """Serves static files plus SQLite-backed /api/health and /api/progress endpoints."""

    def __init__(self, *args, project_dir: str, db: ProgressDatabase, **kwargs):
        self.project_dir = project_dir
        self.db = db
        super().__init__(*args, directory=project_dir, **kwargs)

    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> dict:
        content_len = int(self.headers.get("Content-Length", "0"))
        if content_len <= 0 or content_len > MAX_BODY_BYTES:
            raise ValueError("Invalid payload size")
        raw = self.rfile.read(content_len)
        payload = json.loads(raw.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("Payload must be a JSON object")
        return payload

    def do_GET(self):
        route = self.path.split("?", 1)[0]
        if route == "/api/health":
            self._send_json(
                HTTPStatus.OK, {"ok": True, "mode": "sqlite", "db": "progress.db"}
            )
            return

        if route == "/api/progress":
            try:
                self._send_json(HTTPStatus.OK, self.db.read_all())
            except Exception as exc:
                self._send_json(
                    HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)}
                )
            return

        super().do_GET()

    def do_PATCH(self):
        route = self.path.split("?", 1)[0]
        if route != "/api/progress":
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return
        try:
            body = self._read_json_body()
            self.db.apply_patch(body)
            self._send_json(HTTPStatus.OK, {"ok": True})
        except ValueError as exc:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except Exception as exc:
            self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})

    def do_POST(self):
        route = self.path.split("?", 1)[0]
        if route == "/api/progress/patch":
            try:
                body = self._read_json_body()
                self.db.apply_patch(body)
                self._send_json(HTTPStatus.OK, {"ok": True})
            except ValueError as exc:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            except Exception as exc:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})
            return

        if route == "/api/progress":
            try:
                body = self._read_json_body()
                self.db.replace_all(body)
                self._send_json(HTTPStatus.OK, {"ok": True})
            except ValueError as exc:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            except Exception as exc:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})
            return

        self._send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})


def main():
    parser = argparse.ArgumentParser(
        description="Serve LeetCode Sheet with SQLite (progress.db) persistence."
    )
    parser.add_argument("--port", type=int, default=3008, help="Port to listen on (default: 3008)")
    parser.add_argument("--host", default="127.0.0.1", help="Bind address (default: 127.0.0.1)")
    args = parser.parse_args()

    project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    db_path = os.path.join(project_dir, "progress.db")
    legacy_json_path = os.path.join(project_dir, "progress.json")

    db = ProgressDatabase(db_path)
    db.migrate_json_file(legacy_json_path)

    handler = functools.partial(
        ProgressRequestHandler,
        project_dir=project_dir,
        db=db,
    )

    ThreadingHTTPServer.allow_reuse_address = True
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Serving {project_dir} at http://{args.host}:{args.port} (SQLite: {db_path})")
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
