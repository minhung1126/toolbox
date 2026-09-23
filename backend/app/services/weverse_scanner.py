"""Weverse local folder scanner and subtitle language recognizer."""

import re
from pathlib import Path
from typing import Any, Dict, List, Optional

# Supported video and subtitle extensions
VIDEO_EXTENSIONS = {".mp4", ".mkv", ".mov", ".webm", ".avi", ".m4v"}
SUBTITLE_EXTENSIONS = {".vtt", ".srt"}

# Standard Weverse 16-language mapping table
WEVERSE_LANGUAGE_MAP: Dict[str, Dict[str, str]] = {
    "ar": {"bcp47": "ar", "label": "阿拉伯文 (Arabic)"},
    "de_DE": {"bcp47": "de", "label": "德文 (German)"},
    "en_US": {"bcp47": "en-US", "label": "英文 (English - US)"},
    "es_ES": {"bcp47": "es", "label": "西班牙文 (Spanish)"},
    "fr_FR": {"bcp47": "fr", "label": "法文 (French)"},
    "hi_IN": {"bcp47": "hi", "label": "印地文 (Hindi)"},
    "id_ID": {"bcp47": "id", "label": "印尼文 (Indonesian)"},
    "it_IT": {"bcp47": "it", "label": "義大利文 (Italian)"},
    "ja_JP": {"bcp47": "ja", "label": "日文 (Japanese)"},
    "ko_KR": {"bcp47": "ko", "label": "韓文 (Korean)"},
    "pt_PT": {"bcp47": "pt-PT", "label": "葡萄牙文 (Portuguese)"},
    "ru_RU": {"bcp47": "ru", "label": "俄文 (Russian)"},
    "th_TH": {"bcp47": "th", "label": "泰文 (Thai)"},
    "vi_VN": {"bcp47": "vi", "label": "越南文 (Vietnamese)"},
    "zh_CN": {"bcp47": "zh-CN", "label": "簡體中文 (Chinese - Simplified)"},
    "zh_TW": {"bcp47": "zh-TW", "label": "繁體中文 (Chinese - Traditional)"},
}

# Regex to match: prefix.lang_tag.vtt (e.g. 20260923_xxxx.zh_TW.vtt or video.en.srt)
SUBTITLE_PATTERN = re.compile(
    r"^(?P<prefix>.+?)\.(?P<lang>[a-zA-Z]{2,3}(?:[_-][a-zA-Z0-9]{2,4})?)\.(?P<ext>vtt|srt)$",
    re.IGNORECASE,
)


def format_bytes(size: int) -> str:
    """Format bytes into human-readable string (KB, MB, GB)."""
    if size < 1024:
        return f"{size} B"
    elif size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    elif size < 1024 * 1024 * 1024:
        return f"{size / (1024 * 1024):.1f} MB"
    else:
        return f"{size / (1024 * 1024 * 1024):.2f} GB"


def map_language(raw_lang: str) -> Dict[str, str]:
    """Map a raw language tag (e.g. zh_TW, en_US, ko) to BCP-47 tag and display label."""
    cleaned = raw_lang.strip()
    if cleaned in WEVERSE_LANGUAGE_MAP:
        info = WEVERSE_LANGUAGE_MAP[cleaned]
        return {
            "raw_code": cleaned,
            "bcp47": info["bcp47"],
            "label": info["label"],
        }

    # Normalize underscore to hyphen for standard BCP-47
    bcp47 = cleaned.replace("_", "-")
    # Common short fallbacks
    common_short = {
        "en": ("en", "英文 (English)"),
        "ko": ("ko", "韓文 (Korean)"),
        "ja": ("ja", "日文 (Japanese)"),
        "zh": ("zh-TW", "中文 (Chinese)"),
        "es": ("es", "西班牙文 (Spanish)"),
        "fr": ("fr", "法文 (French)"),
        "de": ("de", "德文 (German)"),
        "ru": ("ru", "俄文 (Russian)"),
        "pt": ("pt", "葡萄牙文 (Portuguese)"),
        "th": ("th", "泰文 (Thai)"),
        "vi": ("vi", "越南文 (Vietnamese)"),
        "id": ("id", "印尼文 (Indonesian)"),
        "hi": ("hi", "印地文 (Hindi)"),
    }
    short_code = bcp47.split("-")[0].lower()
    if short_code in common_short:
        _, fallback_label = common_short[short_code]
        return {
            "raw_code": cleaned,
            "bcp47": bcp47,
            "label": f"{fallback_label} ({bcp47})",
        }

    return {
        "raw_code": cleaned,
        "bcp47": bcp47,
        "label": f"自訂語言 ({bcp47})",
    }


def clean_default_title(filename_or_folder: str) -> str:
    """Generate a clean YouTube video title from a filename or folder name."""
    stem = Path(filename_or_folder).stem
    # Replace underscores with spaces
    title = re.sub(r"[_\s]+", " ", stem).strip()
    return title[:100]


def parse_subtitle_info(filename: str, size: int = 0, full_path: str = "") -> Optional[Dict[str, Any]]:
    """Parse a filename to check if it's a recognized subtitle and extract its language."""
    match = SUBTITLE_PATTERN.match(filename)
    if not match:
        # Check simple extension match
        ext = Path(filename).suffix.lower()
        if ext in SUBTITLE_EXTENSIONS:
            stem = Path(filename).stem
            parts = stem.split(".")
            if len(parts) >= 2:
                raw_lang = parts[-1]
                lang_info = map_language(raw_lang)
                return {
                    "filename": filename,
                    "full_path": full_path,
                    "size_bytes": size,
                    "size_formatted": format_bytes(size),
                    "raw_lang": raw_lang,
                    "bcp47": lang_info["bcp47"],
                    "label": lang_info["label"],
                    "enabled": True,
                }
        return None

    raw_lang = match.group("lang")
    lang_info = map_language(raw_lang)
    return {
        "filename": filename,
        "full_path": full_path,
        "size_bytes": size,
        "size_formatted": format_bytes(size),
        "raw_lang": raw_lang,
        "bcp47": lang_info["bcp47"],
        "label": lang_info["label"],
        "enabled": True,
    }


def scan_single_package_dir(dir_path: Path) -> Optional[Dict[str, Any]]:
    """Scan a single folder to see if it contains a video and subtitle package."""
    if not dir_path.is_dir():
        return None

    videos = []
    subtitles = []

    try:
        entries = sorted(dir_path.iterdir(), key=lambda p: p.name)
    except PermissionError:
        return None

    for entry in entries:
        if not entry.is_file():
            continue
        ext = entry.suffix.lower()
        if ext in VIDEO_EXTENSIONS:
            size = entry.stat().st_size
            videos.append(
                {
                    "filename": entry.name,
                    "full_path": str(entry.resolve()),
                    "size_bytes": size,
                    "size_formatted": format_bytes(size),
                    "extension": ext,
                }
            )
        elif ext in SUBTITLE_EXTENSIONS:
            size = entry.stat().st_size
            sub_info = parse_subtitle_info(entry.name, size=size, full_path=str(entry.resolve()))
            if sub_info:
                subtitles.append(sub_info)

    if not videos and not subtitles:
        return None

    primary_video = videos[0] if videos else None
    title = clean_default_title(primary_video["filename"] if primary_video else dir_path.name)

    return {
        "package_id": dir_path.name,
        "folder_path": str(dir_path.resolve()),
        "folder_name": dir_path.name,
        "video": primary_video,
        "other_videos": videos[1:] if len(videos) > 1 else [],
        "subtitles": subtitles,
        "suggested_title": title,
        "suggested_description": "",
    }


def scan_local_path(target_path_str: str) -> Dict[str, Any]:
    """Scan a target path (single package folder or parent folder containing multiple packages)."""
    target = Path(target_path_str).expanduser()
    if not target.exists():
        raise FileNotFoundError(f"找不到指定的本機路徑：{target_path_str}")
    if not target.is_dir():
        raise ValueError(f"指定的路徑不是資料夾：{target_path_str}")

    # Check if the directory itself is a package
    single_pkg = scan_single_package_dir(target)
    packages: List[Dict[str, Any]] = []

    if single_pkg and single_pkg.get("video"):
        packages.append(single_pkg)
    else:
        # Scan subdirectories
        try:
            subdirs = sorted([d for d in target.iterdir() if d.is_dir()], key=lambda d: d.name)
        except PermissionError as exc:
            raise PermissionError(f"無法存取該資料夾（權限不足）：{target_path_str}") from exc

        for subdir in subdirs:
            sub_pkg = scan_single_package_dir(subdir)
            if sub_pkg and sub_pkg.get("video"):
                packages.append(sub_pkg)

        # If subdirectories had no video, but current directory had subtitles or non-standard structure
        if not packages and single_pkg:
            packages.append(single_pkg)

    return {
        "scanned_path": str(target.resolve()),
        "packages_count": len(packages),
        "packages": packages,
    }


def parse_browser_file_list(files: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Parse a list of file metadata provided by browser folder pick / drag-and-drop.

    Each item in files is expected to have:
      - name (str)
      - size (int)
      - relative_path (Optional[str], e.g. "20260923_xxxx/20260923_xxxx.mp4")
    """
    # Group files by top-level folder name or package
    grouped: Dict[str, Dict[str, Any]] = {}

    for f in files:
        name = f.get("name") or ""
        size = int(f.get("size") or 0)
        rel_path = f.get("relative_path") or name
        folder_name = rel_path.split("/")[0] if "/" in rel_path else "root"

        if folder_name not in grouped:
            grouped[folder_name] = {"videos": [], "subtitles": []}

        ext = Path(name).suffix.lower()
        if ext in VIDEO_EXTENSIONS:
            grouped[folder_name]["videos"].append(
                {
                    "filename": name,
                    "relative_path": rel_path,
                    "size_bytes": size,
                    "size_formatted": format_bytes(size),
                    "extension": ext,
                }
            )
        elif ext in SUBTITLE_EXTENSIONS:
            sub_info = parse_subtitle_info(name, size=size, full_path=rel_path)
            if sub_info:
                sub_info["relative_path"] = rel_path
                grouped[folder_name]["subtitles"].append(sub_info)

    packages: List[Dict[str, Any]] = []
    for folder_name, contents in grouped.items():
        vids = contents["videos"]
        subs = contents["subtitles"]
        if not vids and not subs:
            continue
        primary_vid = vids[0] if vids else None
        title = clean_default_title(primary_vid["filename"] if primary_vid else folder_name)
        packages.append(
            {
                "package_id": folder_name,
                "folder_name": folder_name,
                "video": primary_vid,
                "other_videos": vids[1:] if len(vids) > 1 else [],
                "subtitles": subs,
                "suggested_title": title,
                "suggested_description": "",
            }
        )

    return {
        "packages_count": len(packages),
        "packages": packages,
    }
