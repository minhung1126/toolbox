"""Immutable, explicit ports consumed by workflows; legacy mappings adapt at the boundary."""

from collections.abc import Callable, Mapping
from dataclasses import dataclass, fields
from logging import Logger
from typing import Any, Protocol

from fastapi import HTTPException
from google.oauth2.credentials import Credentials

from backend.app.core.youtube_context import YouTubeRequestContext
from backend.app.services.youtube_errors import YouTubeQuotaUnavailable


class MetadataWriter(Protocol):
    def __call__(
        self,
        context: YouTubeRequestContext,
        video_id: str,
        title: str,
        description: str,
        *,
        current_snippet: dict[str, Any],
    ) -> Any: ...


@dataclass(frozen=True)
class YoutubeWorkflowPorts:
    direct_workflow_response: Callable[..., dict[str, Any]]
    load_and_validate_sheet_data: Callable[[Credentials, str, str, str, str], tuple[list[str], list[dict[str, Any]]]]
    preview_slot: Callable[[object, str], str]
    quota_http_exception: Callable[[YouTubeQuotaUnavailable], HTTPException]
    resolve_person_metadata: Callable[[list[dict[str, Any]], str, str, str, str], tuple[str | None, str, str]]
    resolve_playlist_id: Callable[[YouTubeRequestContext, str | None], str]
    run_youtube_operation_with_quota_fallback: Callable[..., Any]
    stale_preview_exception: Callable[[], HTTPException]
    switch_youtube_context: Callable[..., YouTubeRequestContext | None]
    validate_batch_inputs: Callable[..., Any]
    verify_playlist_preview_token: Callable[..., Any]
    workflow_error_detail: Callable[..., dict[str, Any]]
    youtube_context_metadata: Callable[[YouTubeRequestContext], dict[str, Any]]
    youtube_thumbnail: Callable[[dict[str, Any], str], str]
    build_preview_token: Callable[..., str]
    fetch_playlist_items: Callable[[YouTubeRequestContext, str], list[dict[str, Any]]]
    fetch_video_details: Callable[[YouTubeRequestContext, list[str]], list[dict[str, Any]]]
    get_all_rows_for_sheet: Callable[[Credentials, str, str], list[dict[str, Any]]]
    get_sheet_headers: Callable[[Credentials, str, str], list[str]]
    http_error: Callable[..., HTTPException]
    input_digest: Callable[[dict[str, Any]], str]
    logger: Logger
    map_youtube_error: Callable[..., Any]
    matches_team_person: Callable[[dict[str, Any], str, str], bool]
    normalize_text: Callable[[object], str]
    playlist_snapshot: Callable[[list[dict[str, Any]]], dict[str, Any]]
    remove_playlist_item: Callable[..., Any]
    set_video_public: Callable[..., Any]
    sheet_snapshot: Callable[[str, str, list[str], list[dict[str, Any]]], dict[str, Any]]
    update_single_video_metadata: MetadataWriter
    upload_time_sort_key: Callable[..., Any]
    verify_preview_token: Callable[..., bool]
    video_snapshot_digest: Callable[[dict[str, Any], list[str]], str]

    @classmethod
    def from_legacy(cls, adapters: Mapping[str, Any]) -> "YoutubeWorkflowPorts":
        return cls(
            **{
                field.name: adapters[field.name if field.name in adapters else "_" + field.name]
                for field in fields(cls)
            }
        )
