"""API endpoints for user sticky notes management."""

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from backend.app.core.dependencies import require_account_subject
from backend.app.core.error_contract import http_error
from backend.app.core.notes_store import notes_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notes", tags=["Sticky Notes"])


class CreateNoteRequest(BaseModel):
    content: str = Field(default="", max_length=100000)
    remark: str = Field(default="", max_length=200)
    pinned: bool = Field(default=False)


class UpdateNoteRequest(BaseModel):
    content: Optional[str] = Field(default=None, max_length=100000)
    remark: Optional[str] = Field(default=None, max_length=200)
    pinned: Optional[bool] = Field(default=None)


class NoteResponse(BaseModel):
    id: str
    content: str
    remark: str
    pinned: bool
    created_at: str
    updated_at: str


@router.get("", response_model=Dict[str, Any])
def list_notes(
    q: Optional[str] = Query(default=None, description="關鍵字搜尋"),
    subject: str = Depends(require_account_subject),
) -> Dict[str, Any]:
    """Retrieve all sticky notes for the authenticated user."""
    notes = notes_store.list_notes(subject=subject, query=q or "")
    return {
        "notes": notes,
        "total": len(notes),
    }


@router.post("", response_model=Dict[str, Any])
def create_note(
    payload: CreateNoteRequest,
    subject: str = Depends(require_account_subject),
) -> Dict[str, Any]:
    """Create a new sticky note for the authenticated user."""
    note = notes_store.create_note(
        subject=subject,
        content=payload.content,
        remark=payload.remark,
        pinned=payload.pinned,
    )
    return {
        "note": note,
        "status": "created",
    }


@router.get("/{note_id}", response_model=Dict[str, Any])
def get_note(
    note_id: str,
    subject: str = Depends(require_account_subject),
) -> Dict[str, Any]:
    """Get a single sticky note by ID."""
    note = notes_store.get_note(subject=subject, note_id=note_id)
    if not note:
        raise http_error(404, "note_not_found", "找不到指定的便利貼。")
    return {"note": note}


@router.put("/{note_id}", response_model=Dict[str, Any])
def update_note(
    note_id: str,
    payload: UpdateNoteRequest,
    subject: str = Depends(require_account_subject),
) -> Dict[str, Any]:
    """Update content, remark, or pinned state of a sticky note."""
    note = notes_store.update_note(
        subject=subject,
        note_id=note_id,
        content=payload.content,
        remark=payload.remark,
        pinned=payload.pinned,
    )
    if not note:
        raise http_error(404, "note_not_found", "找不到欲更新的便利貼。")
    return {
        "note": note,
        "status": "updated",
    }


@router.delete("/{note_id}", response_model=Dict[str, Any])
def delete_note(
    note_id: str,
    subject: str = Depends(require_account_subject),
) -> Dict[str, Any]:
    """Delete a sticky note."""
    success = notes_store.delete_note(subject=subject, note_id=note_id)
    if not success:
        raise http_error(404, "note_not_found", "找不到欲刪除的便利貼。")
    return {
        "deleted": True,
        "note_id": note_id,
    }
