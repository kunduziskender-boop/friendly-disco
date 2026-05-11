"""Изоляция строк: assistant и lawyer работают только со «своими» клиентами и связками.

Администратор обходит проверки. У юриста доступ к делу, если он создал клиента
или указан как ``responsible_lawyer_id``."""

from __future__ import annotations

from fastapi import HTTPException


ACCESS_DENIED_DETAIL: dict[str, str] = {
    "code": "ACCESS_DENIED",
    "message": "Недостаточно прав к этой записи (не ваш клиент или объект не привязан к вашей работе).",
}


def assert_access_denied() -> None:
    raise HTTPException(status_code=403, detail=ACCESS_DENIED_DETAIL)


def get_client_creator(conn, client_id: str) -> str | None:
    row = conn.execute(
        "SELECT created_by FROM clients WHERE id = ?", (client_id,)
    ).fetchone()
    return str(row["created_by"]) if row else None


def assistant_owns_client(conn, client_id: str, user_id: str) -> bool:
    owner = get_client_creator(conn, client_id)
    return owner is not None and owner == user_id


def assistant_can_access_case(conn, case_id: str, user_id: str) -> bool:
    row = conn.execute(
        """
        SELECT c.created_by FROM legal_cases lc
        INNER JOIN clients c ON lc.client_id = c.id
        WHERE lc.id = ?
        """,
        (case_id,),
    ).fetchone()
    return row is not None and str(row["created_by"]) == user_id


def lawyer_can_access_case(conn, case_id: str, user_id: str) -> bool:
    row = conn.execute(
        """
        SELECT c.created_by AS client_creator, lc.responsible_lawyer_id
        FROM legal_cases lc
        INNER JOIN clients c ON lc.client_id = c.id
        WHERE lc.id = ?
        """,
        (case_id,),
    ).fetchone()
    if row is None:
        return False
    if str(row["client_creator"]) == user_id:
        return True
    rid = row["responsible_lawyer_id"]
    return rid is not None and str(rid) == user_id


def _lawyer_can_access_document_row(conn, doc_row, user_id: str) -> bool:
    if str(doc_row["uploaded_by"]) == user_id:
        return True
    cid = doc_row["case_id"]
    if cid and lawyer_can_access_case(conn, str(cid), user_id):
        return True
    clid = doc_row["client_id"]
    if clid and assistant_owns_client(conn, str(clid), user_id):
        return True
    return False


def _lawyer_can_access_finance_row(conn, fin_row, user_id: str) -> bool:
    if str(fin_row["created_by"]) == user_id:
        return True
    cid = fin_row["case_id"]
    if cid and lawyer_can_access_case(conn, str(cid), user_id):
        return True
    clid = fin_row["client_id"]
    if clid and assistant_owns_client(conn, str(clid), user_id):
        return True
    return False


def _lawyer_can_access_calendar_row(conn, event_row, user_id: str) -> bool:
    if str(event_row["created_by"]) == user_id:
        return True
    cid = event_row["case_id"]
    if cid and lawyer_can_access_case(conn, str(cid), user_id):
        return True
    clid = event_row["client_id"]
    if clid and assistant_owns_client(conn, str(clid), user_id):
        return True
    return False


def _lawyer_can_read_document_id(conn, doc_id: str, user_id: str) -> bool:
    row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    if row is None:
        return False
    return _lawyer_can_access_document_row(conn, row, user_id)


def _lawyer_can_read_finance_id(conn, record_id: str, user_id: str) -> bool:
    row = conn.execute("SELECT * FROM finance_records WHERE id = ?", (record_id,)).fetchone()
    if row is None:
        return False
    return _lawyer_can_access_finance_row(conn, row, user_id)


def _lawyer_can_read_calendar_id(conn, event_id: str, user_id: str) -> bool:
    row = conn.execute("SELECT * FROM calendar_events WHERE id = ?", (event_id,)).fetchone()
    if row is None:
        return False
    return _lawyer_can_access_calendar_row(conn, row, user_id)


def ensure_assistant_owns_client(conn, client_id: str, user: dict) -> None:
    if user["role"] == "admin":
        return
    if user["role"] not in ("assistant", "lawyer"):
        assert_access_denied()
    row = conn.execute("SELECT created_by FROM clients WHERE id = ?", (client_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Client not found"})
    if str(row["created_by"]) != user["id"]:
        assert_access_denied()


def ensure_assistant_case(conn, case_id: str, user: dict) -> None:
    if user["role"] == "admin":
        return
    if user["role"] == "assistant":
        if not assistant_can_access_case(conn, case_id, user["id"]):
            if not conn.execute("SELECT 1 FROM legal_cases WHERE id = ?", (case_id,)).fetchone():
                raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Case not found"})
            assert_access_denied()
        return
    if user["role"] == "lawyer":
        if not lawyer_can_access_case(conn, case_id, user["id"]):
            if not conn.execute("SELECT 1 FROM legal_cases WHERE id = ?", (case_id,)).fetchone():
                raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Case not found"})
            assert_access_denied()
        return
    assert_access_denied()


def ensure_assistant_task_row(conn, task_row, user: dict) -> None:
    if user["role"] == "admin":
        return
    uid = user["id"]
    if user["role"] == "assistant":
        if task_row["created_by"] == uid or (
            task_row["assignee_user_id"] is not None and task_row["assignee_user_id"] == uid
        ):
            return
        case_id = task_row["case_id"]
        if case_id and assistant_can_access_case(conn, str(case_id), uid):
            return
        cid = task_row["client_id"] if "client_id" in task_row.keys() else None
        if cid and assistant_owns_client(conn, str(cid), uid):
            return
        assert_access_denied()
        return
    if user["role"] == "lawyer":
        if task_row["created_by"] == uid or (
            task_row["assignee_user_id"] is not None and task_row["assignee_user_id"] == uid
        ):
            return
        case_id = task_row["case_id"]
        if case_id and lawyer_can_access_case(conn, str(case_id), uid):
            return
        cid = task_row["client_id"] if "client_id" in task_row.keys() else None
        if cid and assistant_owns_client(conn, str(cid), uid):
            return
        assert_access_denied()
        return
    assert_access_denied()


def assistant_task_sql_scope(user_id: str) -> tuple[str, list]:
    clause = """(
        tasks.created_by = ?
        OR tasks.assignee_user_id = ?
        OR (
            tasks.case_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM legal_cases lc
                INNER JOIN clients c ON lc.client_id = c.id
                WHERE lc.id = tasks.case_id AND c.created_by = ?
            )
        )
    )"""
    return clause, [user_id, user_id, user_id]


def assistant_document_scope(user_id: str) -> tuple[str, list]:
    clause = """(
        documents.uploaded_by = ?
        OR (
            documents.client_id IS NOT NULL
            AND EXISTS (SELECT 1 FROM clients c WHERE c.id = documents.client_id AND c.created_by = ?)
        )
        OR (
            documents.case_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM legal_cases lc
                INNER JOIN clients c ON lc.client_id = c.id
                WHERE lc.id = documents.case_id AND c.created_by = ?
            )
        )
    )"""
    return clause, [user_id, user_id, user_id]


def assistant_finance_scope(user_id: str) -> tuple[str, list]:
    clause = """(
        finance_records.created_by = ?
        OR (
            finance_records.client_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM clients c WHERE c.id = finance_records.client_id AND c.created_by = ?
            )
        )
        OR (
            finance_records.case_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM legal_cases lc
                INNER JOIN clients c ON lc.client_id = c.id
                WHERE lc.id = finance_records.case_id AND c.created_by = ?
            )
        )
    )"""
    return clause, [user_id, user_id, user_id]


def assistant_calendar_scope(user_id: str) -> tuple[str, list]:
    clause = """(
        calendar_events.created_by = ?
        OR (
            calendar_events.client_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM clients c WHERE c.id = calendar_events.client_id AND c.created_by = ?
            )
        )
        OR (
            calendar_events.case_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM legal_cases lc
                INNER JOIN clients c ON lc.client_id = c.id
                WHERE lc.id = calendar_events.case_id AND c.created_by = ?
            )
        )
    )"""
    return clause, [user_id, user_id, user_id]


def ensure_assistant_calendar_mutation(conn, event_row: dict, user: dict) -> None:
    """Изменять/удалять: assistant — только автор; lawyer — автор или запись в его деле/у клиента."""
    if user["role"] == "admin":
        return
    if user["role"] == "assistant":
        if str(event_row["created_by"]) != user["id"]:
            assert_access_denied()
        return
    if user["role"] == "lawyer":
        if not _lawyer_can_access_calendar_row(conn, event_row, user["id"]):
            assert_access_denied()
        return
    assert_access_denied()


def ensure_assistant_document_mutation(conn, doc_row: dict, user: dict) -> None:
    if user["role"] == "admin":
        return
    if user["role"] == "assistant":
        if str(doc_row["uploaded_by"]) != user["id"]:
            assert_access_denied()
        return
    if user["role"] == "lawyer":
        if not _lawyer_can_access_document_row(conn, doc_row, user["id"]):
            assert_access_denied()
        return
    assert_access_denied()


def ensure_assistant_readable_document(conn, doc_id: str, user: dict) -> None:
    if user["role"] == "admin":
        return
    if user["role"] == "assistant":
        clause, plist = assistant_document_scope(user["id"])
        q = f"SELECT 1 FROM documents WHERE id = ? AND ({clause})"
        if not conn.execute(q, [doc_id, *plist]).fetchone():
            if not conn.execute("SELECT 1 FROM documents WHERE id = ?", (doc_id,)).fetchone():
                raise HTTPException(
                    status_code=404, detail={"code": "NOT_FOUND", "message": "Document not found"}
                )
            assert_access_denied()
        return
    if user["role"] == "lawyer":
        if not _lawyer_can_read_document_id(conn, doc_id, user["id"]):
            if not conn.execute("SELECT 1 FROM documents WHERE id = ?", (doc_id,)).fetchone():
                raise HTTPException(
                    status_code=404, detail={"code": "NOT_FOUND", "message": "Document not found"}
                )
            assert_access_denied()
        return
    assert_access_denied()


def ensure_assistant_readable_finance(conn, record_id: str, user: dict) -> None:
    if user["role"] == "admin":
        return
    if user["role"] == "assistant":
        clause, plist = assistant_finance_scope(user["id"])
        q = f"SELECT 1 FROM finance_records WHERE id = ? AND ({clause})"
        if not conn.execute(q, [record_id, *plist]).fetchone():
            if not conn.execute(
                "SELECT 1 FROM finance_records WHERE id = ?", (record_id,)
            ).fetchone():
                raise HTTPException(
                    status_code=404,
                    detail={"code": "NOT_FOUND", "message": "Finance record not found"},
                )
            assert_access_denied()
        return
    if user["role"] == "lawyer":
        if not _lawyer_can_read_finance_id(conn, record_id, user["id"]):
            if not conn.execute(
                "SELECT 1 FROM finance_records WHERE id = ?", (record_id,)
            ).fetchone():
                raise HTTPException(
                    status_code=404,
                    detail={"code": "NOT_FOUND", "message": "Finance record not found"},
                )
            assert_access_denied()
        return
    assert_access_denied()


def ensure_assistant_readable_calendar(conn, event_id: str, user: dict) -> None:
    if user["role"] == "admin":
        return
    if user["role"] == "assistant":
        clause, plist = assistant_calendar_scope(user["id"])
        q = f"SELECT 1 FROM calendar_events WHERE id = ? AND ({clause})"
        if not conn.execute(q, [event_id, *plist]).fetchone():
            if not conn.execute("SELECT 1 FROM calendar_events WHERE id = ?", (event_id,)).fetchone():
                raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Event not found"})
            assert_access_denied()
        return
    if user["role"] == "lawyer":
        if not _lawyer_can_read_calendar_id(conn, event_id, user["id"]):
            if not conn.execute("SELECT 1 FROM calendar_events WHERE id = ?", (event_id,)).fetchone():
                raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Event not found"})
            assert_access_denied()
        return
    assert_access_denied()


def ensure_assistant_finance_mutation(conn, row: dict, user: dict) -> None:
    if user["role"] == "admin":
        return
    if user["role"] == "assistant":
        if str(row["created_by"]) != user["id"]:
            assert_access_denied()
        return
    if user["role"] == "lawyer":
        if not _lawyer_can_access_finance_row(conn, row, user["id"]):
            assert_access_denied()
        return
    assert_access_denied()
