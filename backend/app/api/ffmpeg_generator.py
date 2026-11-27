"""API router for FFmpeg Command Generator tool."""

import json
import math
import re
from pathlib import Path
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
    audio_bitrate: Optional[str] = None
    resolution: str = "original"


class ParseTimeRequest(BaseModel):
    time_str: Optional[str] = Field(default=None, max_length=50)
    seconds: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)


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
    shell_dialect: Optional[str] = Field(default=None, pattern="^(bash|powershell|cmd)$")
    line_layout: str = Field(default="multiline", pattern="^(single|multiline)$")
    source_duration: Optional[float] = Field(default=None, gt=0, allow_inf_nan=False)


class CommandParamExplanation(BaseModel):
    param: str
    explanation: str


class BuildCommandResponse(BaseModel):
    command_active: str
    command_single: str
    command_multi: str
    breakdown: List[CommandParamExplanation]


PRESET_TEMPLATES = [
    FfmpegPreset(**item)
    for item in json.loads(
        (Path(__file__).parents[1] / "resources/ffmpeg-presets.v1.json").read_text(encoding="utf-8")
    )["presets"]
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
    if not re.fullmatch(r"(?:\d+:)?(?:[0-5]?\d:)?\d+(?:\.\d+)?", time_str):
        return None
    parts = [float(part) for part in time_str.split(":")]
    if len(parts) > 1 and parts[-1] >= 60 or len(parts) == 3 and parts[1] >= 60:
        return None
    total = 0.0
    for part in parts:
        total = total * 60 + part
    return total if math.isfinite(total) else None


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


def safe_quote_filename(name: str, shell: str = "bash") -> str:
    """Quote exactly one argument. CMD expansion characters are deliberately rejected."""
    if re.search(r"[\x00-\x1f\x7f]", name):
        raise ValueError("不可包含換行或控制字元。")
    if shell == "cmd":
        if any(char in name for char in '%!"'):
            raise ValueError("CMD 無法可靠保留 %、! 或雙引號；請改用 Bash 或 PowerShell。")
        return '"' + re.sub(r"(\\+)$", r"\1\1", name) + '"'
    if shell == "powershell":
        return "'" + name.replace("'", "''") + "'"
    return "'" + name.replace("'", "'\"'\"'") + "'"


@router.post("/build", response_model=BuildCommandResponse)
def build_command(req: BuildCommandRequest) -> BuildCommandResponse:
    """Generate the FFmpeg command line and breakdown."""
    import ntpath
    import posixpath

    shell = req.shell_dialect or req.shell
    errors = {}
    for field, value in req.model_dump().items():
        if isinstance(value, str) and not (field == "volume" and value == "100%"):
            try:
                safe_quote_filename(value, shell)
            except ValueError as exc:
                errors[field] = str(exc)
    for field in ("input_file", "output_file"):
        value = getattr(req, field)
        if not value.strip() or value.startswith("-"):
            errors[field] = "請填寫檔名；開頭不可為 -。"

    def normalize(name):
        return (
            ntpath.normcase(ntpath.normpath(name)) if re.search(r"^[a-z]:|\\", name, re.I) else posixpath.normpath(name)
        )

    if normalize(req.input_file) == normalize(req.output_file):
        errors["output_file"] = "輸入與輸出不可為同一路徑。"
    for field in ("start_time", "end_time", "duration"):
        value = getattr(req, field)
        if value is not None and parse_time_string(value) is None:
            errors[field] = "請輸入有效的非負時間。"
    start = parse_time_string(req.start_time or "0") or 0
    end = (
        parse_time_string(req.end_time or "")
        if req.cut_mode == "to"
        else start + (parse_time_string(req.duration or "") or 0)
        if req.duration is not None
        else None
    )
    if end is not None and end <= start:
        errors["end_time" if req.cut_mode == "to" else "duration"] = "終點須晚於起點，長度須大於零。"
    if req.source_duration and (start >= req.source_duration or end is not None and end > req.source_duration + 0.001):
        errors["end_time"] = "裁切範圍超過已知影片長度。"
    if errors:
        raise http_error(400, "invalid_command", "請修正欄位後再複製指令。", field_errors=errors)
    input_file, output_file = req.input_file, req.output_file
    in_safe, out_safe = input_file, output_file

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
            if start_sec and req.seek_mode == "fast":
                args.extend(["-t", seconds_to_hhmmss(end_sec - start_sec)])
            else:
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
            clean_filter = req.custom_filters.strip()
            v_filters.append(clean_filter)

        if v_filters:
            combined_vf = ",".join(v_filters)
            args.extend(["-vf", combined_vf])
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
            args.extend(["-af", f"volume={clean_vol}"])
            breakdown.append(
                CommandParamExplanation(
                    param=f'-af "volume={clean_vol}"', explanation=f"音訊濾鏡：音量調整為 {clean_vol}"
                )
            )

    # Output file
    args.append(out_safe)
    breakdown.append(CommandParamExplanation(param=out_safe, explanation=f"輸出目標檔案路徑：{out_safe}"))

    # Generate single-line and multi-line commands
    line_sep = " \\\n  " if shell == "bash" else (" `\n  " if shell == "powershell" else " ^\n  ")
    args = [
        arg
        if index == 0 or re.fullmatch(r"[a-zA-Z0-9_.:/-]+", arg) and arg != input_file and index != len(args) - 1
        else safe_quote_filename(arg, shell)
        for index, arg in enumerate(args)
    ]
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
        command_active=command_single if req.line_layout == "single" else command_multi,
        command_single=command_single,
        command_multi=command_multi,
        breakdown=breakdown,
    )
