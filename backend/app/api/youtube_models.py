"""Pydantic schemas and request models for YouTube operations."""

from typing import Annotated, Any, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PlaylistItemsInput(BaseModel):
    playlist_id: Optional[str] = Field(default="", max_length=256)


class VideoEditStatusInput(BaseModel):
    video_ids: list[Annotated[str, Field(min_length=1, max_length=128)]] = Field(min_length=1, max_length=500)


class VideoMetadataUpdateInput(BaseModel):
    video_id: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=5000)


class VideoAssignment(BaseModel):
    video_id: str = Field(min_length=1, max_length=128)
    person: str = Field(max_length=1500)


class BatchUpdateInput(BaseModel):
    request_id: Optional[str] = Field(default=None, min_length=1, max_length=128)
    spreadsheet_url_or_id: Optional[str] = Field(default="", max_length=512)
    playlist_id: Optional[str] = Field(default="", max_length=256)
    youtube_slot: Optional[Literal["primary", "secondary"]] = None
    preview_token: Optional[str] = Field(default=None, max_length=16_384)
    preview_snapshot: Optional[dict[str, Any]] = None
    video_type: str = Field(default="Video", max_length=32)
    worksheet_name: str = Field(min_length=1, max_length=200)
    title_column: str = Field(min_length=1, max_length=200)
    description_column: str = Field(min_length=1, max_length=200)
    team: str = Field(default="", max_length=200)
    assignments: List[VideoAssignment] = Field(min_length=1, max_length=500)


class PublishCleanupInput(BaseModel):
    version: Literal[2] = 2
    mode: Literal["cleanup_only"] = "cleanup_only"
    request_id: Optional[str] = Field(default=None, min_length=1, max_length=128)
    playlist_id: Optional[str] = Field(default="", max_length=256)
    youtube_slot: Optional[Literal["primary", "secondary"]] = None
    preview_token: Optional[str] = Field(default=None, max_length=16_384)
    preview_snapshot: Optional[dict[str, Any]] = None


class DraftPrepareInput(BatchUpdateInput):
    video_type: Literal["Video", "Shorts"] = "Video"

    @model_validator(mode="after")
    def unique_videos(self):
        ids = [item.video_id for item in self.assignments]
        if len(ids) != len(set(ids)):
            raise ValueError("影片不得重複。")
        return self


class FinalVideoDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    video_id: str = Field(min_length=1, max_length=128)
    # Skipped rows may retain invalid edits so the user can repair them later.
    title: str = Field(max_length=10_000)
    description: str = Field(default="", max_length=100_000)
    skip: bool = False

    @model_validator(mode="after")
    def nonempty_title(self):
        if not self.skip and not self.title.strip():
            raise ValueError("標題不得為空。")
        if not self.skip and (len(self.title) > 100 or len(self.description) > 5000):
            raise ValueError("標題最多 100 字元，描述最多 5,000 字元。")
        return self


class DraftPublishInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: Optional[str] = Field(default=None, min_length=1, max_length=128)
    youtube_slot: Optional[Literal["primary", "secondary"]] = None
    stage_token: str = Field(min_length=1, max_length=16_384)
    stage_snapshot: dict[str, Any]
    edits: List[FinalVideoDraft] = Field(min_length=1, max_length=500)
    preview_token: Optional[str] = Field(default=None, max_length=16_384)
    preview_snapshot: Optional[dict[str, Any]] = None

    @model_validator(mode="after")
    def unique_videos(self):
        ids = [item.video_id for item in self.edits]
        if len(ids) != len(set(ids)):
            raise ValueError("影片不得重複。")
        return self


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
