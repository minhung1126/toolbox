"""Pydantic schemas and request models for YouTube operations."""

from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field


class PlaylistItemsInput(BaseModel):
    playlist_id: Optional[str] = Field(default="", max_length=256)


class VideoMetadataUpdateInput(BaseModel):
    video_id: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=5000)


class VideoAssignment(BaseModel):
    video_id: str = Field(min_length=1, max_length=128)
    person: str = Field(max_length=200)


class BatchUpdateInput(BaseModel):
    spreadsheet_url_or_id: Optional[str] = Field(default="", max_length=512)
    playlist_id: Optional[str] = Field(default="", max_length=256)
    youtube_slot: Optional[Literal["primary", "secondary"]] = None
    preview_token: Optional[str] = Field(default=None, max_length=16_384)
    preview_snapshot: Optional[dict[str, Any]] = None
    video_type: str = Field(default="Video", max_length=32)
    worksheet_name: str = Field(min_length=1, max_length=200)
    title_column: str = Field(min_length=1, max_length=200)
    description_column: str = Field(min_length=1, max_length=200)
    team: str = Field(min_length=1, max_length=200)
    assignments: List[VideoAssignment] = Field(min_length=1, max_length=500)


class PublishCleanupInput(BaseModel):
    playlist_id: Optional[str] = Field(default="", max_length=256)
    youtube_slot: Optional[Literal["primary", "secondary"]] = None
    preview_token: Optional[str] = Field(default=None, max_length=16_384)
    preview_snapshot: Optional[dict[str, Any]] = None


class QuotaEstimateInput(BaseModel):
    operation: Literal["youtube.metadata_update", "youtube.publish_cleanup"]
    item_count: int = Field(ge=0, le=500)
    slot: Optional[str] = Field(default=None, max_length=32)


__all__ = [
    "BatchUpdateInput",
    "PlaylistItemsInput",
    "PublishCleanupInput",
    "QuotaEstimateInput",
    "VideoAssignment",
    "VideoMetadataUpdateInput",
]
