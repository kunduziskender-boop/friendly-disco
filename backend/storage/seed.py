"""Seed the database with demo data.

Called once at startup from main.py.
If the users table is already populated the function returns immediately,
so it is safe to call on every restart.

Demo user passwords must be set via environment (see ``.env.example``), not in code.

E2E user ``test@example.com`` (role: lawyer): set ``E2E_TEST_USER_PASSWORD``;
``ensure_test_user`` skips if it is unset (e.g. production).
"""
import json
import os
import uuid

from core.security import hash_password
from storage.database import _now, get_db

TEST_USER_EMAIL = "test@example.com"


def _require_seed_demo_password(env_name: str) -> str:
    value = os.getenv(env_name, "").strip()
    if not value:
        raise RuntimeError(
            f"{env_name} must be set to seed an empty database "
            "(see backend/.env.example)."
        )
    return value


def _uid() -> str:
    return str(uuid.uuid4())


def seed_db() -> None:
    with get_db() as conn:
        if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] > 0:
            return  # already seeded

        # ── Users ──────────────────────────────────────────────────────────
        admin_id  = _uid()
        lawyer_id = _uid()
        asst_id   = _uid()
        test_id   = _uid()

        admin_pw = _require_seed_demo_password("SEED_DEMO_ADMIN_PASSWORD")
        lawyer_pw = _require_seed_demo_password("SEED_DEMO_LAWYER_PASSWORD")
        asst_pw = _require_seed_demo_password("SEED_DEMO_ASSISTANT_PASSWORD")
        e2e_pw = _require_seed_demo_password("E2E_TEST_USER_PASSWORD")

        conn.executemany(
            "INSERT INTO users (id,full_name,email,password_hash,role,is_active,created_at)"
            " VALUES (?,?,?,?,?,?,?)",
            [
                (admin_id,  "Admin User",    "admin@example.com",     hash_password(admin_pw),  "admin",     1, _now()),
                (lawyer_id, "Иванов Иван",   "lawyer@example.com",    hash_password(lawyer_pw), "lawyer",    1, _now()),
                (asst_id,   "Петрова Анна",  "assistant@example.com", hash_password(asst_pw), "assistant", 1, _now()),
                (test_id,   "Test User",     TEST_USER_EMAIL,         hash_password(e2e_pw), "lawyer", 1, _now()),
            ],
        )

        # ── Clients ────────────────────────────────────────────────────────
        cl1_id = _uid()
        cl2_id = _uid()

        conn.executemany(
            "INSERT INTO clients (id,name,phone,email,client_type,notes,created_by,created_at)"
            " VALUES (?,?,?,?,?,?,?,?)",
            [
                (cl1_id, "Иванова Мария Сергеевна", "+79991234567", "ivanova@mail.ru",    "individual", "Постоянный клиент",    lawyer_id, _now()),
                (cl2_id, 'ООО "Альфа Групп"',       "+74951234567", "alpha@business.com", "company",    "Корпоративный клиент", lawyer_id, _now()),
            ],
        )

        # ── Cases ──────────────────────────────────────────────────────────
        case1_id = _uid()
        case2_id = _uid()

        conn.executemany(
            "INSERT INTO legal_cases"
            " (id,case_number,title,description,status,client_id,responsible_lawyer_id,opened_at,closed_at)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            [
                (case1_id, "2024-001", "Раздел имущества",         "Бракоразводный процесс", "in_progress", cl1_id, lawyer_id, _now(), None),
                (case2_id, "2024-002", "Корпоративный спор с ФНС", "Налоговая проверка",     "open",        cl2_id, lawyer_id, _now(), None),
            ],
        )

        # ── Tasks ──────────────────────────────────────────────────────────
        conn.executemany(
            "INSERT INTO tasks"
            " (id,title,description,due_date,status,priority,case_id,assignee_user_id,created_by,created_at,completed_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            [
                (
                    _uid(),
                    "Подготовить исковое заявление",
                    "Составить иск по разделу имущества",
                    "2026-05-20T00:00:00+00:00",
                    "todo", "high",
                    case1_id, lawyer_id, lawyer_id, _now(), None,
                ),
                (
                    _uid(),
                    "Запросить выписку ЕГРН",
                    None,
                    "2026-05-15T00:00:00+00:00",
                    "todo", "medium",
                    case2_id, asst_id, lawyer_id, _now(), None,
                ),
            ],
        )

        # ── Calendar events ────────────────────────────────────────────────
        conn.executemany(
            "INSERT INTO calendar_events"
            " (id,title,description,start_at,end_at,event_type,case_id,participants,created_by)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            [
                (
                    _uid(),
                    "Заседание суда по делу 2024-001", None,
                    "2026-05-22T10:00:00+00:00", "2026-05-22T12:00:00+00:00",
                    "hearing", case1_id, json.dumps([lawyer_id]), lawyer_id,
                ),
                (
                    _uid(),
                    'Встреча с клиентом ООО "Альфа"', None,
                    "2026-05-18T14:00:00+00:00", "2026-05-18T15:00:00+00:00",
                    "meeting", case2_id, json.dumps([lawyer_id, asst_id]), lawyer_id,
                ),
            ],
        )

        # ── Documents ──────────────────────────────────────────────────────
        conn.executemany(
            "INSERT INTO documents"
            " (id,title,doc_type,status,file_name,case_id,client_id,uploaded_by,uploaded_at)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            [
                (_uid(), "Исковое заявление (черновик)", "claim",    "draft", "isk_ivanova_draft.docx", case1_id, cl1_id, lawyer_id, _now()),
                (_uid(), 'Договор на услуги ООО "Альфа"', "contract", "final", "contract_alpha.pdf",    case2_id, cl2_id, lawyer_id, _now()),
            ],
        )

        # ── Finance records ────────────────────────────────────────────────
        conn.executemany(
            "INSERT INTO finance_records"
            " (id,record_type,amount,currency,payment_date,status,client_id,case_id,description,created_by,created_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            [
                (_uid(), "payment", 50000.0,  "RUB", "2026-05-01", "paid",    cl1_id, case1_id, "Гонорар за ведение дела",     lawyer_id, _now()),
                (_uid(), "expense",  3500.0,  "RUB", "2026-05-03", "paid",    None,   case1_id, "Государственная пошлина",     lawyer_id, _now()),
                (_uid(), "payment", 120000.0, "RUB", "2026-05-05", "pending", cl2_id, case2_id, "Аванс по корпоративному делу", lawyer_id, _now()),
            ],
        )


def ensure_test_user() -> None:
    """Insert E2E test user if ``E2E_TEST_USER_PASSWORD`` is set and email is absent."""
    pw = os.getenv("E2E_TEST_USER_PASSWORD", "").strip()
    if not pw:
        return
    with get_db() as conn:
        if conn.execute(
            "SELECT 1 FROM users WHERE email = ?", (TEST_USER_EMAIL,)
        ).fetchone():
            return
        conn.execute(
            "INSERT INTO users (id,full_name,email,password_hash,role,is_active,created_at)"
            " VALUES (?,?,?,?,?,?,?)",
            (
                _uid(),
                "Test User",
                TEST_USER_EMAIL,
                hash_password(pw),
                "lawyer",
                1,
                _now(),
            ),
        )
