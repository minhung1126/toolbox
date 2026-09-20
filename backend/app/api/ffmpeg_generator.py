"""API router for FFmpeg Command Generator tool."""

from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.app.core.error_contract import http_error

router = APIRouter(prefix="/ffmpeg-generator", tags=["FFmpeg Generator"])


class FfmpegPreset(BaseModel):
    id: str
    name: str
    description: str
    category: str
    mode: str = Field(description="'copy', 'reencode', 'audio', 'gif', or 'filter'")
    video_codec: Optional[str] = None
    audio_codec: Optional[str] = None
    crf: Optional[int] = None
    preset: Optional[str] = None
    video_filters: Optional[str] = None
    audio_filters: Optional[str] = None
    output_ext: str = "mp4"
    extra_args: Optional[str] = None


class ParseTimeRequest(BaseModel):
    time_str: Optional[str] = Field(default=None, max_length=50)
    seconds: Optional[float] = Field(default=None, ge=0)


class ParseTimeResponse(BaseModel):
    seconds: float
    formatted: str
    valid: bool


class BuildCommandRequest(BaseModel):
    input_file: str = Field(default="input.mp4", max_length=255)
    output_file: str = Field(default="output.mp4", max_length=255)
    start_time: Optional[str] = Field(default=None, max_length=30)
    end_time: Optional[str] = Field(default=None, max_length=30)
    duration: Optional[str] = Field(default=None, max_length=30)
    cut_mode: str = Field(default="to", pattern="^(to|duration)$")
    seek_mode: str = Field(default="fast", pattern="^(fast|accurate)$")
    mode: str = Field(default="copy", pattern="^(copy|reencode|custom)$")
    video_codec: Optional[str] = Field(default=None, max_length=50)
    audio_codec: Optional[str] = Field(default=None, max_length=50)
    crf: Optional[int] = Field(default=None, ge=0, le=51)
    preset: Optional[str] = Field(default=None, max_length=30)
    resolution: Optional[str] = Field(default=None, max_length=30)
    fps: Optional[int] = Field(default=None, ge=1, le=240)
    audio_bitrate: Optional[str] = Field(default=None, max_length=20)
    volume: Optional[str] = Field(default=None, max_length=20)
    remove_audio: bool = False
    remove_video: bool = False
    custom_filters: Optional[str] = Field(default=None, max_length=500)
    shell: str = Field(default="bash", pattern="^(bash|powershell|cmd)$")


class CommandParamExplanation(BaseModel):
    param: str
    explanation: str


class BuildCommandResponse(BaseModel):
    command_single: str
    command_multi: str
    breakdown: List[CommandParamExplanation]


PRESET_TEMPLATES: List[FfmpegPreset] = [
    FfmpegPreset(
        id="lossless-trim",
        name="極速無損剪切 (Stream Copy)",
        description="不經過重新編碼，以最快速度無失真裁剪片段，保留原始畫面與音質。",
        category="剪輯裁剪",
        mode="copy",
        video_codec="copy",
        audio_codec="copy",
        output_ext="mp4",
    ),
    FfmpegPreset(
        id="high-quality-h264",
        name="高相容 H.264 (x264 平衡畫質)",
        description="最通用的 MP4/H.264 編碼，CRF 23 視覺平衡，相容於幾乎所有播放器與社交平台。",
        category="標準轉檔",
        mode="reencode",
        video_codec="libx264",
        audio_codec="aac",
        crf=23,
        preset="medium",
        output_ext="mp4",
    ),
    FfmpegPreset(
        id="efficient-h265",
        name="高效壓縮 H.265 (HEVC)",
        description="在維持高畫質的同時顯著減少檔案大小，適合存檔與現代行動裝置播放。",
        category="標準轉檔",
        mode="reencode",
        video_codec="libx265",
        audio_codec="aac",
        crf=26,
        preset="medium",
        output_ext="mp4",
    ),
    FfmpegPreset(
        id="vertical-shorts",
        name="社群 9:16 Shorts/Reels (黑邊補齊)",
        description="將橫向影片等比例縮放至 1080x1920，並自動在上下居中補黑邊，適用於 Shorts 或 TikTok。",
        category="社群短片",
        mode="reencode",
        video_codec="libx264",
        audio_codec="aac",
        crf=22,
        preset="fast",
        video_filters="scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
        output_ext="mp4",
    ),
    FfmpegPreset(
        id="extract-audio-mp3",
        name="擷取音訊為 MP3",
        description="移除視訊軌，直接輸出高品質 192kbps MP3 音訊檔案。",
        category="音訊處理",
        mode="audio",
        audio_codec="libmp3lame",
        audio_bitrate="192k",
        output_ext="mp3",
    ),
    FfmpegPreset(
        id="mute-video",
        name="移除音軌 (影片靜音)",
        description="保留視訊流複製，移除所有音軌，生成純靜音影片。",
        category="音訊處理",
        mode="copy",
        video_codec="copy",
        output_ext="mp4",
        extra_args="-an",
    ),
    FfmpegPreset(
        id="animated-gif",
        name="高品質動態 GIF",
        description="透過兩階段調色盤優化 (palettegen/paletteuse) 產生不失真的高流暢 GIF 動圖。",
        category="特效轉檔",
        mode="gif",
        video_filters="fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
        output_ext="gif",
    ),
]


def seconds_to_hhmmss(total_seconds: float) -> str:
    """Format seconds into hh:mm:ss.mmm."""
    if total_seconds < 0:
        total_seconds = 0.0
    hours = int(total_seconds // 3600)
    minutes = int((total_seconds % 3600) // 60)
    secs = total_seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"


def parse_time_string(time_str: str) -> Optional[float]:
    """Parse a time string (hh:mm:ss, mm:ss, ss.mmm) into seconds float."""
    s = time_str.strip()
    if not s:
        return None
    # Check simple float
    try:
        val = float(s)
        return max(0.0, val)
    except ValueError:
        pass

    # Match hh:mm:ss[.mmm] or mm:ss[.mmm]
    parts = s.split(":")
    try:
        if len(parts) == 3:
            h = float(parts[0])
            m = float(parts[1])
            sec = float(parts[2])
            return max(0.0, h * 3600 + m * 60 + sec)
        elif len(parts) == 2:
            m = float(parts[0])
            sec = float(parts[1])
            return max(0.0, m * 60 + sec)
    except ValueError:
        return None

    return None


@router.get("/presets", response_model=List[FfmpegPreset])
def get_presets() -> List[FfmpegPreset]:
    """Return preset FFmpeg command recipes."""
    return PRESET_TEMPLATES


@router.post("/parse-time", response_model=ParseTimeResponse)
def parse_time(req: ParseTimeRequest) -> ParseTimeResponse:
    """Validate and convert timestamps between seconds and hh:mm:ss.mmm."""
    if req.seconds is not None:
        secs = max(0.0, req.seconds)
        return ParseTimeResponse(seconds=secs, formatted=seconds_to_hhmmss(secs), valid=True)

    if req.time_str is not None:
        parsed = parse_time_string(req.time_str)
        if parsed is not None:
            return ParseTimeResponse(seconds=parsed, formatted=seconds_to_hhmmss(parsed), valid=True)

    raise http_error(400, "invalid_time_format", "無法解析提供的時間格式。請使用 hh:mm:ss.mmm 或秒數。")


def safe_quote_filename(name: str) -> str:
    """Ensure filenames are safely wrapped in double quotes for CLI execution, escaping quotes."""
    cleaned = (name or "").strip()
    if not cleaned:
        return '""'
    if cleaned.startswith('"') and cleaned.endswith('"') and len(cleaned) >= 2:
        cleaned = cleaned[1:-1]
    escaped = cleaned.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


@router.post("/build", response_model=BuildCommandResponse)
def build_command(req: BuildCommandRequest) -> BuildCommandResponse:
    """Generate the FFmpeg command line and breakdown."""
    input_file = req.input_file.strip() or "input.mp4"
    output_file = req.output_file.strip() or "output.mp4"

    in_safe = safe_quote_filename(input_file)
    out_safe = safe_quote_filename(output_file)

    breakdown: List[CommandParamExplanation] = []
    args: List[str] = ["ffmpeg"]
    breakdown.append(CommandParamExplanation(param="ffmpeg", explanation="呼叫 FFmpeg 核心多媒體轉檔引擎"))

    # Seeking before -i (fast seek)
    start_sec = parse_time_string(req.start_time) if req.start_time else None
    if start_sec is not None and start_sec > 0 and req.seek_mode == "fast":
        time_fmt = seconds_to_hhmmss(start_sec)
        args.extend(["-ss", time_fmt])
        breakdown.append(
            CommandParamExplanation(
                param=f"-ss {time_fmt}",
                explanation=f"起點快速跳轉至 {time_fmt}（置於 -i 前，利用關鍵影格快速定位）",
            )
        )

    # Input file
    args.extend(["-i", in_safe])
    breakdown.append(CommandParamExplanation(param=f"-i {in_safe}", explanation=f"指定輸入檔案來源：{in_safe}"))

    # Seeking after -i (accurate seek)
    if start_sec is not None and start_sec > 0 and req.seek_mode == "accurate":
        time_fmt = seconds_to_hhmmss(start_sec)
        args.extend(["-ss", time_fmt])
        breakdown.append(
            CommandParamExplanation(
                param=f"-ss {time_fmt}",
                explanation=f"起點精確解碼至 {time_fmt}（置於 -i 後，逐影格精確定位）",
            )
        )

    # End cut / duration
    if req.cut_mode == "to" and req.end_time:
        end_sec = parse_time_string(req.end_time)
        if end_sec is not None:
            time_fmt = seconds_to_hhmmss(end_sec)
            args.extend(["-to", time_fmt])
            breakdown.append(
                CommandParamExplanation(
                    param=f"-to {time_fmt}",
                    explanation=f"裁剪至影片時間點 {time_fmt}",
                )
            )
    elif req.cut_mode == "duration" and req.duration:
        dur_sec = parse_time_string(req.duration)
        if dur_sec is not None and dur_sec > 0:
            time_fmt = seconds_to_hhmmss(dur_sec)
            args.extend(["-t", time_fmt])
            breakdown.append(
                CommandParamExplanation(
                    param=f"-t {time_fmt}",
                    explanation=f"持續裁剪長度為 {time_fmt}",
                )
            )

    # Audio/Video extraction or muting
    if req.remove_video:
        args.append("-vn")
        breakdown.append(CommandParamExplanation(param="-vn", explanation="移除視訊軌（僅保留音訊或輸出音訊檔）"))
    if req.remove_audio:
        args.append("-an")
        breakdown.append(CommandParamExplanation(param="-an", explanation="移除音軌（完全靜音處理）"))

    # Codecs and filters
    if not req.remove_video:
        if req.mode == "copy" or req.video_codec == "copy":
            args.extend(["-c:v", "copy"])
            breakdown.append(
                CommandParamExplanation(param="-c:v copy", explanation="無損複製視訊流，不需耗費 CPU 重新編碼")
            )
        elif req.video_codec:
            args.extend(["-c:v", req.video_codec])
            breakdown.append(
                CommandParamExplanation(
                    param=f"-c:v {req.video_codec}", explanation=f"視訊編碼器指定為 {req.video_codec}"
                )
            )

            if req.crf is not None:
                args.extend(["-crf", str(req.crf)])
                breakdown.append(
                    CommandParamExplanation(
                        param=f"-crf {req.crf}",
                        explanation=f"設定恆定品質係數 CRF={req.crf}（數值越低畫質越高）",
                    )
                )

            if req.preset:
                args.extend(["-preset", req.preset])
                breakdown.append(
                    CommandParamExplanation(
                        param=f"-preset {req.preset}",
                        explanation=f"編碼速度預設：{req.preset}",
                    )
                )

        # Filters: resolution, fps, custom
        v_filters: List[str] = []
        if req.resolution and req.resolution != "original":
            if req.resolution == "1080p":
                v_filters.append(
                    "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2"
                )
            elif req.resolution == "720p":
                v_filters.append("scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2")
            elif req.resolution == "4k":
                v_filters.append(
                    "scale=3840:2160:force_original_aspect_ratio=decrease,pad=3840:2160:(ow-iw)/2:(oh-ih)/2"
                )
            elif req.resolution == "shorts_9_16":
                v_filters.append(
                    "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2"
                )
            else:
                v_filters.append(f"scale={req.resolution}")

        if req.fps:
            v_filters.append(f"fps={req.fps}")

        if req.custom_filters:
            clean_filter = req.custom_filters.strip().replace('"', '\\"')
            v_filters.append(clean_filter)

        if v_filters:
            combined_vf = ",".join(v_filters)
            args.extend(["-vf", f'"{combined_vf}"'])
            breakdown.append(
                CommandParamExplanation(
                    param=f'-vf "{combined_vf}"', explanation="套用視訊濾鏡（解析度、幀率或自訂縮放）"
                )
            )

    # Audio options
    if not req.remove_audio:
        if req.mode == "copy" or req.audio_codec == "copy":
            args.extend(["-c:a", "copy"])
            breakdown.append(CommandParamExplanation(param="-c:a copy", explanation="無損複製音訊流，直接封裝不重壓縮"))
        elif req.audio_codec:
            args.extend(["-c:a", req.audio_codec])
            breakdown.append(
                CommandParamExplanation(
                    param=f"-c:a {req.audio_codec}", explanation=f"音訊編碼器指定為 {req.audio_codec}"
                )
            )

            if req.audio_bitrate:
                args.extend(["-b:a", req.audio_bitrate])
                breakdown.append(
                    CommandParamExplanation(
                        param=f"-b:a {req.audio_bitrate}", explanation=f"音訊碼率設定為 {req.audio_bitrate}"
                    )
                )

        if req.volume and req.volume != "100%":
            clean_vol = req.volume.strip().replace('"', "").replace("'", "")
            args.extend(["-af", f'"volume={clean_vol}"'])
            breakdown.append(
                CommandParamExplanation(
                    param=f'-af "volume={clean_vol}"', explanation=f"音訊濾鏡：音量調整為 {clean_vol}"
                )
            )

    # Output file
    args.append(out_safe)
    breakdown.append(CommandParamExplanation(param=out_safe, explanation=f"輸出目標檔案路徑：{out_safe}"))

    # Generate single-line and multi-line commands
    line_sep = " \\\n  " if req.shell == "bash" else (" `\n  " if req.shell == "powershell" else " ^\n  ")
    command_single = " ".join(args)

    # Multi-line formatting grouping
    multi_groups: List[str] = ["ffmpeg"]
    i = 1
    while i < len(args):
        arg = args[i]
        if arg.startswith("-") and i + 1 < len(args) and not args[i + 1].startswith("-"):
            multi_groups.append(f"{arg} {args[i + 1]}")
            i += 2
        else:
            multi_groups.append(arg)
            i += 1

    command_multi = line_sep.join(multi_groups)

    return BuildCommandResponse(
        command_single=command_single,
        command_multi=command_multi,
        breakdown=breakdown,
    )
