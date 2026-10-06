"""Pure artist metadata normalization independent of providers and storage."""

import re
import unicodedata


def normalize_artist_name(name: str | None) -> str:
    """Normalize artist name by removing YouTube auto-generated Topic channel suffixes.

    YouTube generates "- Topic" (or localized variants like "- 主題", "(Topic)")
    channels for official audio tracks. Stripping this suffix ensures that
    tracks uploaded to the main artist channel and tracks released via Topic
    channels group under the same artist for sorting and display.

    Examples:
        'QWER - Topic' -> 'QWER'
        'QWER - 主題' -> 'QWER'
        'QWER (Topic)' -> 'QWER'
        'QWER（主題）' -> 'QWER'
    """
    if not name:
        return ""
    raw = str(name).strip()
    if not raw:
        return ""

    parts = [p.strip() for p in raw.split(",")]
    normalized_parts: list[str] = []
    for p in parts:
        cleaned = re.sub(r"\s*[-–—－]\s*(?:topic|主題|主题)\s*$", "", p, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*[\(（](?:topic|主題|主题)[\)）]\s*$", "", cleaned, flags=re.IGNORECASE)
        cleaned = cleaned.strip()
        normalized_parts.append(cleaned if cleaned else p)

    result = ", ".join(normalized_parts)
    return result if result.strip() else raw


GENERIC_ARTIST_NAMES = frozenset(
    {
        "various artists",
        "various",
        "va",
        "群星",
        "合輯",
        "合辑",
        "原聲帶",
        "原声带",
        "soundtrack",
        "ost",
    }
)


def is_generic_artist(name: str | None) -> bool:
    """Check if an artist name represents generic/compilation artists (e.g. Various Artists, 群星)."""
    if not name:
        return False
    norm = unicodedata.normalize("NFKC", str(name)).strip().casefold()
    return norm in GENERIC_ARTIST_NAMES


def split_artists(name: str | None) -> list[str]:
    """Split an artist string or collaboration into individual artist names.

    Handles:
    - Comma / Chinese ideographic comma: 'Artist A, Artist B', 'Artist A、Artist B'
    - Ampersand: 'Artist A & Artist B'
    - Feat keywords: 'Artist A feat. Artist B', 'Artist A ft. Artist B', 'Artist A featuring Artist B', 'Artist A with Artist B'
    - Parenthesized feat: 'Artist A (feat. Artist B)', 'Artist A [ft. Artist B]'
    - Slashes and cross marks: 'Artist A / Artist B', 'Artist A x Artist B', 'Artist A × Artist B'
    - Auto-generated YouTube Topic suffixes are cleanly stripped.
    """
    if not name:
        return []
    raw = str(name).strip()
    if not raw:
        return []

    cleaned = normalize_artist_name(raw)

    feat_paren_match = re.search(
        r"[\(\[\（](?:feat\.?|ft\.?|featuring|with)\s+([^\)\]\）]+)[\)\]\）]",
        cleaned,
        flags=re.IGNORECASE,
    )
    extra_artists: list[str] = []
    if feat_paren_match:
        feat_str = feat_paren_match.group(1).strip()
        cleaned = (cleaned[: feat_paren_match.start()] + cleaned[feat_paren_match.end() :]).strip()
        extra_artists = [p.strip() for p in re.split(r",|、|&|/|;", feat_str) if p.strip()]

    pattern = r"\s*(?:,\s*|、|;\s*|\s+(?:feat\.?|ft\.?|featuring|with)\s+|\s+/\s+|\s+&\s+|\s+[xX×]\s+)\s*"
    parts = [p.strip() for p in re.split(pattern, cleaned, flags=re.IGNORECASE) if p.strip()]

    all_parts = parts + extra_artists
    seen: set[str] = set()
    result: list[str] = []
    for p in all_parts:
        norm_p = unicodedata.normalize("NFKC", p).strip()
        if norm_p and norm_p.casefold() not in seen:
            seen.add(norm_p.casefold())
            result.append(norm_p)

    return result if result else [cleaned]


def get_first_artist(name: str | None) -> str:
    """Extract the primary (first) artist from an artist string."""
    artists = split_artists(name)
    return artists[0] if artists else (normalize_artist_name(name) if name else "")
