from fastapi import APIRouter, HTTPException, Depends
from typing import Optional

from schemas.calendar_events import CalendarEventCreate, CalendarEventUpdate, CalendarEventOut
from core.rbac import require_role
from storage.memory import db, _now, _make_id

router = APIRouter()


@router.post("", response_model=CalendarEventOut, status_code=201, summary="Create calendar event")
def create_event(
    body: CalendarEventCreate,
    current_user: dict = Depends(require_role("calendar_events", "create")),
):
    if body.case_id and body.case_id not in db["cases"]:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_REFERENCE", "message": f"Case '{body.case_id}' not found"},
        )
    eid = _make_id("ev", db["calendar_events"])
    record = {
        "id":           eid,
        "title":        body.title,
        "description":  body.description,
        "start_at":     body.start_at.isoformat(),
        "end_at":       body.end_at.isoformat(),
        "event_type":   body.event_type,
        "case_id":      body.case_id,
        "participants": body.participants,
        "created_by":   current_user["id"],
    }
    db["calendar_events"][eid] = record
    return record


@router.get("", response_model=list[CalendarEventOut], summary="List calendar events")
def list_events(
    event_type: Optional[str] = None,
    case_id: Optional[str] = None,
    current_user: dict = Depends(require_role("calendar_events", "read")),
):
    items = list(db["calendar_events"].values())
    if event_type:
        items = [e for e in items if e["event_type"] == event_type]
    if case_id:
        items = [e for e in items if e["case_id"] == case_id]
    return items


@router.get("/{event_id}", response_model=CalendarEventOut, summary="Get event by id")
def get_event(
    event_id: str,
    current_user: dict = Depends(require_role("calendar_events", "read")),
):
    event = db["calendar_events"].get(event_id)
    if not event:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Event not found"})
    return event


@router.patch("/{event_id}", response_model=CalendarEventOut, summary="Update event")
def update_event(
    event_id: str,
    body: CalendarEventUpdate,
    current_user: dict = Depends(require_role("calendar_events", "update")),
):
    event = db["calendar_events"].get(event_id)
    if not event:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Event not found"})
    data = body.model_dump(exclude_none=True)
    if "start_at" in data:
        data["start_at"] = data["start_at"].isoformat()
    if "end_at" in data:
        data["end_at"] = data["end_at"].isoformat()
    event.update(data)
    return event


@router.delete("/{event_id}", status_code=204, summary="Delete event")
def delete_event(
    event_id: str,
    current_user: dict = Depends(require_role("calendar_events", "delete")),
):
    if event_id not in db["calendar_events"]:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Event not found"})
    del db["calendar_events"][event_id]
