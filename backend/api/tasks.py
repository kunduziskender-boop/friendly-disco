from fastapi import APIRouter, HTTPException, Depends
from typing import Optional

from schemas.tasks import TaskCreate, TaskUpdate, TaskOut
from core.rbac import require_role
from storage.memory import db, _now, _make_id

router = APIRouter()


@router.post("", response_model=TaskOut, status_code=201, summary="Create task")
def create_task(
    body: TaskCreate,
    current_user: dict = Depends(require_role("tasks", "create")),
):
    if body.case_id and body.case_id not in db["cases"]:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_REFERENCE", "message": f"Case '{body.case_id}' not found"},
        )
    tid = _make_id("tsk", db["tasks"])
    record = {
        "id":               tid,
        "title":            body.title,
        "description":      body.description,
        "due_date":         body.due_date.isoformat(),
        "status":           body.status,
        "priority":         body.priority,
        "case_id":          body.case_id,
        "assignee_user_id": body.assignee_user_id,
        "created_by":       current_user["id"],
        "created_at":       _now(),
        "completed_at":     None,
    }
    db["tasks"][tid] = record
    return record


@router.get("", response_model=list[TaskOut], summary="List tasks")
def list_tasks(
    status: Optional[str] = None,
    case_id: Optional[str] = None,
    assignee_user_id: Optional[str] = None,
    current_user: dict = Depends(require_role("tasks", "read")),
):
    items = list(db["tasks"].values())
    if status:
        items = [t for t in items if t["status"] == status]
    if case_id:
        items = [t for t in items if t["case_id"] == case_id]
    if assignee_user_id:
        items = [t for t in items if t["assignee_user_id"] == assignee_user_id]
    return items


@router.get("/{task_id}", response_model=TaskOut, summary="Get task by id")
def get_task(
    task_id: str,
    current_user: dict = Depends(require_role("tasks", "read")),
):
    task = db["tasks"].get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Task not found"})
    return task


@router.patch("/{task_id}", response_model=TaskOut, summary="Update task")
def update_task(
    task_id: str,
    body: TaskUpdate,
    current_user: dict = Depends(require_role("tasks", "update")),
):
    task = db["tasks"].get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Task not found"})
    data = body.model_dump(exclude_none=True)
    if "due_date" in data:
        data["due_date"] = data["due_date"].isoformat()
    if "completed_at" in data:
        data["completed_at"] = data["completed_at"].isoformat()
    task.update(data)
    return task


@router.delete("/{task_id}", status_code=204, summary="Delete task")
def delete_task(
    task_id: str,
    current_user: dict = Depends(require_role("tasks", "delete")),
):
    if task_id not in db["tasks"]:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Task not found"})
    del db["tasks"][task_id]
