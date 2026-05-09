import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query

from schemas.calendar_events import CalendarEventCreate, CalendarEventUpdate, CalendarEventOut, EventType
from core.rbac import require_role
from core.row_access import (
    assistant_calendar_scope,
    ensure_assistant_calendar_mutation,
    ensure_assistant_case,
    ensure_assistant_owns_client,
    ensure_assistant_readable_calendar,
)
from storage.database import get_db, row_to_dict

router = APIRouter()


def _get_participants(conn, event_id: str) -> list[str]:
    rows = conn.execute(
        "SELECT user_id FROM calendar_event_participants WHERE event_id = ?", (event_id,)
    ).fetchall()
    return [r["user_id"] for r in rows]


def _set_participants(conn, event_id: str, user_ids: list[str]) -> None:
    conn.execute("DELETE FROM calendar_event_participants WHERE event_id = ?", (event_id,))
    for uid in user_ids:
        if uid:
            conn.execute(
                "INSERT OR IGNORE INTO calendar_event_participants (event_id, user_id) VALUES (?, ?)",
                (event_id, uid),
            )


def _parse_iso_dt(raw: object) -> datetime:
    """Parse DB or JSON datetime (ISO format, optional Z suffix)."""
    if isinstance(raw, datetime):
        return raw
    s = str(raw).strip().replace("Z", "+00:00")
    return datetime.fromisoformat(s)


def _build_event(conn, event_id: str) -> dict | None:
    row = conn.execute("SELECT * FROM calendar_events WHERE id = ?", (event_id,)).fetchone()
    if row is None:
        return None
    d = row_to_dict(row)
    d["participants"] = _get_participants(conn, event_id)
    return d


@router.post("", response_model=CalendarEventOut, status_code=201, summary="Create calendar event")
def create_event(
    body: CalendarEventCreate,
    current_user: dict = Depends(require_role("calendar_events", "create")),
):
    with get_db() as conn:
        if body.case_id and not conn.execute(
            "SELECT 1 FROM legal_cases WHERE id = ?", (body.case_id,)
        ).fetchone():
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_REFERENCE", "message": f"Case '{body.case_id}' not found"},
            )
        if body.client_id and not conn.execute(
            "SELECT 1 FROM clients WHERE id = ?", (body.client_id,)
        ).fetchone():
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_REFERENCE", "message": f"Client '{body.client_id}' not found"},
            )
        if body.case_id:
            ensure_assistant_case(conn, body.case_id, current_user)
        if body.client_id:
            ensure_assistant_owns_client(conn, body.client_id, current_user)
        eid = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO calendar_events"
            " (id,title,description,start_at,end_at,event_type,case_id,client_id,location,created_by)"
            " VALUES (?,?,?,?,?,?,?,?,?,?)",
            (eid, body.title, body.description,
             body.start_at.isoformat(), body.end_at.isoformat(),
             body.event_type.value, body.case_id, body.client_id,
             body.location, current_user["id"]),
        )
        _set_participants(conn, eid, body.participants)
        event = _build_event(conn, eid)
    return event


@router.get("", response_model=list[CalendarEventOut], summary="List calendar events")
def list_events(
    event_type: Optional[EventType] = Query(None),
    case_id: Optional[str] = None,
    current_user: dict = Depends(require_role("calendar_events", "read")),
):
    query = "SELECT id FROM calendar_events WHERE 1=1"
    params: list = []
    if current_user["role"] == "assistant":
        scope, plist = assistant_calendar_scope(current_user["id"])
        query += f" AND ({scope})"
        params.extend(plist)
    if event_type:
        query += " AND event_type = ?"
        params.append(event_type.value)
    if case_id:
        query += " AND case_id = ?"
        params.append(case_id)
    with get_db() as conn:
        ids = [r["id"] for r in conn.execute(query, params).fetchall()]
        return [_build_event(conn, eid) for eid in ids]


@router.get("/{event_id}", response_model=CalendarEventOut, summary="Get event by id")
def get_event(
    event_id: str,
    current_user: dict = Depends(require_role("calendar_events", "read")),
):
    with get_db() as conn:
        event = _build_event(conn, event_id)
        if not event:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Event not found"})
        ensure_assistant_readable_calendar(conn, event_id, current_user)
    return event


@router.patch("/{event_id}", response_model=CalendarEventOut, summary="Update event")
def update_event(
    event_id: str,
    body: CalendarEventUpdate,
    current_user: dict = Depends(require_role("calendar_events", "update")),
):
    with get_db() as conn:
        row_evt = conn.execute("SELECT * FROM calendar_events WHERE id = ?", (event_id,)).fetchone()
        if not row_evt:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Event not found"})
        ensure_assistant_readable_calendar(conn, event_id, current_user)
        ensure_assistant_calendar_mutation(conn, row_to_dict(row_evt), current_user)
        patch = body.model_dump(mode="json", exclude_unset=True)
        participants = patch.pop("participants", None)

        if "case_id" in patch:
            cid = patch["case_id"]
            if cid is not None and not conn.execute(
                "SELECT 1 FROM legal_cases WHERE id = ?", (cid,)
            ).fetchone():
                raise HTTPException(
                    status_code=400,
                    detail={"code": "INVALID_REFERENCE", "message": f"Case '{cid}' not found"},
                )
        if "client_id" in patch:
            clid = patch["client_id"]
            if clid is not None and not conn.execute(
                "SELECT 1 FROM clients WHERE id = ?", (clid,)
            ).fetchone():
                raise HTTPException(
                    status_code=400,
                    detail={"code": "INVALID_REFERENCE", "message": f"Client '{clid}' not found"},
                )

        if "case_id" in patch and patch["case_id"] is not None:
            ensure_assistant_case(conn, patch["case_id"], current_user)
        if "client_id" in patch and patch["client_id"] is not None:
            ensure_assistant_owns_client(conn, patch["client_id"], current_user)

        row = conn.execute("SELECT * FROM calendar_events WHERE id = ?", (event_id,)).fetchone()
        old = row_to_dict(row)
        eff_start = patch.get("start_at", old["start_at"])
        eff_end = patch.get("end_at", old["end_at"])
        if _parse_iso_dt(eff_end) <= _parse_iso_dt(eff_start):
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_INTERVAL", "message": "end_at must be after start_at"},
            )

        cols = {k: v for k, v in patch.items() if v is not None}
        if cols:
            sets = ", ".join(f"{k} = ?" for k in cols)
            conn.execute(f"UPDATE calendar_events SET {sets} WHERE id = ?", (*cols.values(), event_id))
        if participants is not None:
            _set_participants(conn, event_id, participants)
        event = _build_event(conn, event_id)
    return event


@router.delete("/{event_id}", status_code=204, summary="Delete event")
def delete_event(
    event_id: str,
    current_user: dict = Depends(require_role("calendar_events", "delete")),
):
    with get_db() as conn:
        row_evt = conn.execute("SELECT * FROM calendar_events WHERE id = ?", (event_id,)).fetchone()
        if not row_evt:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Event not found"})
        ensure_assistant_readable_calendar(conn, event_id, current_user)
        ensure_assistant_calendar_mutation(conn, row_to_dict(row_evt), current_user)
        conn.execute("DELETE FROM calendar_events WHERE id = ?", (event_id,))
