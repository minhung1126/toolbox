"""FFmpeg Command Generator Plugin for the Toolbox Platform.

Provides interactive video trimming preview, keyframe/exact seeking, lossless stream
copying, encoding presets, and formatted command generation with clipboard integration.
"""

from typing import Optional

from fastapi import APIRouter

from backend.app.api.ffmpeg_generator import router as ffmpeg_router
from backend.app.tools.base import ToolMetadata, ToolPlugin, ToolRoute


class FfmpegGeneratorPlugin(ToolPlugin):
    """Toolbox plugin providing FFmpeg command generation and video trimming workbench."""

    def __init__(self) -> None:
        self._metadata = ToolMetadata(
            id="ffmpeg-generator",
            name="FFmpeg Generator",
            title="FFmpeg 命令行生成器",
            description="本機影片預覽與片段設定，產生需在電腦執行的 FFmpeg 指令；不會上傳影片。",
            category="影音創作",
            icon="Video",
            version="1.0.0",
            status="active",
            entry_url="/ffmpeg-generator",
            routes=[
                ToolRoute(
                    path="/ffmpeg-generator",
                    label="FFmpeg 命令行生成器",
                    description="影片剪輯預覽與 FFmpeg 命令行產生工作台",
                ),
            ],
            required_scopes=[],
            tags=["ffmpeg", "video", "trim", "cli", "transcode", "stream-copy", "creator"],
        )
        self._router = ffmpeg_router

    @property
    def metadata(self) -> ToolMetadata:
        return self._metadata

    @property
    def router(self) -> Optional[APIRouter]:
        return self._router
