"""SQLite persistence layer.

DB_PATH defaults to crm.db in the backend root directory.
Override by setting DB_PATH in .env.
"""
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

DB_PATH: str = os.getenv("DB_PATH", str(Path(__file__).parent.parent / "crm.db"))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextmanager
def get_db():
    """Yield an open SQLite connection; commit on success, rollback on error."""
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def row_to_dict(row) -> dict | None:
    """Convert a sqlite3.Row to a plain dict."""
    if row is None:
        return None
    d = dict(row)
    if "is_active" in d:
        d["is_active"] = bool(d["is_active"])
    return d


def init_db() -> None:
    """Create all tables for a fresh database."""
    with get_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id            TEXT PRIMARY KEY,
                full_name     TEXT NOT NULL,
                email         TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role          TEXT NOT NULL,
                is_active     INTEGER NOT NULL DEFAULT 1,
                phone         TEXT,
                created_at    TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS clients (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                phone       TEXT NOT NULL,
                email       TEXT,
                client_type TEXT NOT NULL,
                notes       TEXT,
                address     TEXT,
                inn         TEXT,
                created_by  TEXT NOT NULL REFERENCES users(id),
                created_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS legal_cases (
                id                    TEXT PRIMARY KEY,
                case_number           TEXT NOT NULL UNIQUE,
                title                 TEXT NOT NULL,
                description           TEXT,
                status                TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','closed','archived')),
                client_id             TEXT NOT NULL REFERENCES clients(id),
                responsible_lawyer_id TEXT REFERENCES users(id),
                court_name            TEXT,
                next_hearing_date     TEXT,
                opposing_party        TEXT,
                case_summary          TEXT,
                opened_at             TEXT NOT NULL,
                closed_at             TEXT,
                CHECK (closed_at IS NULL OR closed_at >= opened_at)
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id               TEXT PRIMARY KEY,
                title            TEXT NOT NULL,
                description      TEXT,
                due_date         TEXT NOT NULL,
                status           TEXT NOT NULL DEFAULT 'todo'
                    CHECK (status IN ('todo','in_progress','done','overdue')),
                priority         TEXT NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('low','medium','high')),
                case_id          TEXT REFERENCES legal_cases(id),
                client_id        TEXT REFERENCES clients(id),
                assignee_user_id TEXT REFERENCES users(id),
                created_by       TEXT NOT NULL REFERENCES users(id),
                created_at       TEXT NOT NULL,
                completed_at     TEXT
            );

            CREATE TABLE IF NOT EXISTS calendar_events (
                id           TEXT PRIMARY KEY,
                title        TEXT NOT NULL,
                description  TEXT,
                start_at     TEXT NOT NULL,
                end_at       TEXT NOT NULL,
                event_type   TEXT NOT NULL DEFAULT 'other'
                    CHECK (event_type IN ('hearing','meeting','deadline','other')),
                case_id      TEXT REFERENCES legal_cases(id),
                client_id    TEXT REFERENCES clients(id),
                location     TEXT,
                created_by   TEXT NOT NULL REFERENCES users(id),
                CHECK (end_at > start_at)
            );

            CREATE TABLE IF NOT EXISTS calendar_event_participants (
                event_id TEXT NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
                user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                PRIMARY KEY (event_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS documents (
                id          TEXT PRIMARY KEY,
                title       TEXT NOT NULL,
                doc_type    TEXT NOT NULL,
                status      TEXT NOT NULL DEFAULT 'draft',
                file_name   TEXT,
                mime_type   TEXT,
                file_size   INTEGER,
                case_id     TEXT REFERENCES legal_cases(id),
                client_id   TEXT REFERENCES clients(id),
                uploaded_by TEXT NOT NULL REFERENCES users(id),
                uploaded_at TEXT NOT NULL,
                CHECK (case_id IS NOT NULL OR client_id IS NOT NULL)
            );

            CREATE TABLE IF NOT EXISTS finance_records (
                id             TEXT PRIMARY KEY,
                record_type    TEXT NOT NULL,
                amount         REAL NOT NULL CHECK (amount > 0),
                currency       TEXT NOT NULL DEFAULT 'RUB',
                payment_date   TEXT NOT NULL,
                status         TEXT NOT NULL DEFAULT 'pending',
                client_id      TEXT REFERENCES clients(id),
                case_id        TEXT REFERENCES legal_cases(id),
                description    TEXT,
                payment_method TEXT,
                invoice_number TEXT,
                created_by     TEXT NOT NULL REFERENCES users(id),
                created_at     TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS leads (
                id                     TEXT PRIMARY KEY,
                name                   TEXT NOT NULL,
                phone                  TEXT NOT NULL,
                email                  TEXT,
                message                TEXT,
                source                 TEXT,
                consent_personal_data  INTEGER NOT NULL DEFAULT 0,
                status                 TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','contacted','converted','rejected')),
                sheets_appended_at     TEXT,
                telegram_sent_at       TEXT,
                last_integration_error TEXT,
                created_at             TEXT NOT NULL
            );

            """
        )


def migrate_db() -> None:
    """Apply non-destructive migrations to an existing database.

    Safe to call on every startup: uses ALTER TABLE ADD COLUMN (idempotent via
    try/except), CREATE TABLE/INDEX IF NOT EXISTS, and INSERT OR IGNORE.
    """
    _new_columns = [
        # (table, column, definition)
        ("users",          "phone",             "TEXT"),
        ("clients",        "address",           "TEXT"),
        ("clients",        "inn",               "TEXT"),
        ("legal_cases",    "court_name",        "TEXT"),
        ("legal_cases",    "next_hearing_date", "TEXT"),
        ("legal_cases",    "opposing_party",    "TEXT"),
        ("legal_cases",    "case_summary",      "TEXT"),
        ("tasks",          "client_id",         "TEXT REFERENCES clients(id)"),
        ("calendar_events","location",          "TEXT"),
        ("calendar_events","client_id",         "TEXT REFERENCES clients(id)"),
        ("documents",      "mime_type",         "TEXT"),
        ("documents",      "file_size",         "INTEGER"),
        ("finance_records","payment_method",    "TEXT"),
        ("finance_records","invoice_number",    "TEXT"),
    ]

    _indices = [
        ("idx_legal_cases_client",  "legal_cases(client_id)"),
        ("idx_legal_cases_lawyer",  "legal_cases(responsible_lawyer_id)"),
        ("idx_tasks_case",          "tasks(case_id)"),
        ("idx_tasks_client",        "tasks(client_id)"),
        ("idx_tasks_assignee",      "tasks(assignee_user_id)"),
        ("idx_calendar_case",       "calendar_events(case_id)"),
        ("idx_calendar_client",     "calendar_events(client_id)"),
        ("idx_documents_case",      "documents(case_id)"),
        ("idx_documents_client",    "documents(client_id)"),
        ("idx_finance_client",      "finance_records(client_id)"),
        ("idx_finance_case",        "finance_records(case_id)"),
        ("idx_leads_status",        "leads(status)"),
        ("idx_leads_created_at",    "leads(created_at)"),
    ]

    with get_db() as conn:
        # 0. Создание новых таблиц для существующих БД (для leads и подобных).
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS leads (
                id                     TEXT PRIMARY KEY,
                name                   TEXT NOT NULL,
                phone                  TEXT NOT NULL,
                email                  TEXT,
                message                TEXT,
                source                 TEXT,
                consent_personal_data  INTEGER NOT NULL DEFAULT 0,
                status                 TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','contacted','converted','rejected')),
                sheets_appended_at     TEXT,
                telegram_sent_at       TEXT,
                last_integration_error TEXT,
                created_at             TEXT NOT NULL
            )
            """
        )

        # 1. Add new columns (silently skip if already exist)
        for table, col, defn in _new_columns:
            try:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {defn}")
            except Exception:
                pass

        # 2. Create junction table for calendar participants
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS calendar_event_participants (
                event_id TEXT NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
                user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                PRIMARY KEY (event_id, user_id)
            )
            """
        )

        # 3. Migrate JSON participants → junction table
        rows = conn.execute(
            "SELECT id, participants FROM calendar_events WHERE participants IS NOT NULL"
        ).fetchall()
        for row in rows:
            try:
                ids = json.loads(row["participants"] or "[]")
                for uid in ids:
                    if uid:
                        conn.execute(
                            "INSERT OR IGNORE INTO calendar_event_participants"
                            " (event_id, user_id) VALUES (?, ?)",
                            (row["id"], uid),
                        )
            except Exception:
                pass

        # 4. Migrate JSON description → dedicated case columns
        rows = conn.execute(
            "SELECT id, description FROM legal_cases WHERE description IS NOT NULL"
        ).fetchall()
        for row in rows:
            try:
                meta = json.loads(row["description"])
                if any(k in meta for k in ("court", "deadline", "summary")):
                    conn.execute(
                        "UPDATE legal_cases"
                        " SET court_name = COALESCE(court_name, ?),"
                        "     next_hearing_date = COALESCE(next_hearing_date, ?),"
                        "     case_summary = COALESCE(case_summary, ?)"
                        " WHERE id = ?",
                        (meta.get("court") or None,
                         meta.get("deadline") or None,
                         meta.get("summary") or None,
                         row["id"]),
                    )
                    # Keep only fs in description to preserve frontend status mapping
                    fs = meta.get("fs")
                    new_desc = json.dumps({"fs": fs}) if fs else None
                    conn.execute(
                        "UPDATE legal_cases SET description = ? WHERE id = ?",
                        (new_desc, row["id"]),
                    )
            except Exception:
                pass

        # 5. Create indices
        for name, target in _indices:
            conn.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {target}")
