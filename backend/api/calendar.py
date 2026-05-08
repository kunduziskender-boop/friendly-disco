import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends

from schemas.calendar_events import CalendarEventCreate, CalendarEventUpdate, CalendarEventOut
from core.rbac import require_role
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
                status_code=422,
                detail={"code": "INVALID_REFERENCE", "message": f"Case '{body.case_id}' not found"},
            )
        if body.client_id and not conn.execute(
            "SELECT 1 FROM clients WHERE id = ?", (body.client_id,)
        ).fetchone():
            raise HTTPException(
                status_code=422,
                detail={"code": "INVALID_REFERENCE", "message": f"Client '{body.client_id}' not found"},
            )
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
    event_type: Optional[str] = None,
    case_id: Optional[str] = None,
    current_user: dict = Depends(require_role("calendar_events", "read")),
):
    query = "SELECT id FROM calendar_events WHERE 1=1"
    params: list = []
    if event_type:
        query += " AND event_type = ?"
        params.append(event_type)
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
    return event


@router.patch("/{event_id}", response_model=CalendarEventOut, summary="Update event")
def update_event(
    event_id: str,
    body: CalendarEventUpdate,
    current_user: dict = Depends(require_role("calendar_events", "update")),
):
    with get_db() as conn:
        if not conn.execute("SELECT 1 FROM calendar_events WHERE id = ?", (event_id,)).fetchone():
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Event not found"})
        data = body.model_dump(mode="json", exclude_none=True)
        participants = data.pop("participants", None)
        if data:
            sets = ", ".join(f"{k} = ?" for k in data)
            conn.execute(f"UPDATE calendar_events SET {sets} WHERE id = ?", (*data.values(), event_id))
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
        if not conn.execute("SELECT 1 FROM calendar_events WHERE id = ?", (event_id,)).fetchone():
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Event not found"})
        conn.execute("DELETE FROM calendar_events WHERE id = ?", (event_id,))
