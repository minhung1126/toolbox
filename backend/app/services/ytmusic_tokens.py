"""Browser token parsing independent of account repositories and client construction."""

import json
import logging
import re
from typing import Any

from ytmusicapi.auth.browser import initialize_headers
from ytmusicapi.helpers import get_authorization

logger = logging.getLogger(__name__)

DEFAULT_YTMUSIC_LANGUAGE = "zh_TW"
DEFAULT_YTMUSIC_LOCATION = "TW"


class YtmusicTokenInputError(ValueError):
    """A local token-input error whose message is safe to show to the user."""


def _clean_cmd_escapes(s: str) -> str:
    """Unescape Windows cmd.exe escape sequences in cURL commands."""
    if "^" not in s:
        return s
    s = s.replace("^%^", "%")
    return re.sub(r"\^([&\"^%()\\=<>|])", r"\1", s)


def _extract_headers_from_curl(curl_cmd: str) -> dict[str, str]:
    """Extract headers and cookies from a cURL command string (bash, cmd, or PowerShell)."""
    cleaned = _clean_cmd_escapes(curl_cmd)
    headers: dict[str, str] = {}

    # 1. Extract -H / --header parameters
    h_pattern = r"""(?:-H|--header)\s+(?:'([^']*)'|"([^"]*)"|([^\s'"]+:[^\s'"]+))"""
    for m in re.findall(h_pattern, cleaned):
        hdr = m[0] or m[1] or m[2]
        if ":" in hdr:
            k, v = hdr.split(":", 1)
            headers[k.strip().lower()] = v.strip()

    # 2. Extract -b / --cookie parameters (used by Windows cmd cURL export)
    b_pattern = r"""(?:-b|--cookie)\s+(?:'([^']*)'|"([^"]*)")"""
    for m in re.findall(b_pattern, cleaned):
        cookie_val = m[0] or m[1]
        if cookie_val:
            headers["cookie"] = cookie_val.strip()

    return headers


def _extract_headers_from_fetch(fetch_cmd: str) -> dict[str, str]:
    """Extract headers dictionary from a JavaScript fetch() command string (Copy as fetch)."""
    m = re.search(r"""(?:["']?headers["']?)\s*:\s*\{([^}]+)\}""", fetch_cmd, re.DOTALL | re.IGNORECASE)
    if not m:
        return {}
    headers_block = m.group(1).strip()
    headers: dict[str, str] = {}

    try:
        cleaned = "{" + headers_block + "}"
        cleaned = re.sub(r",(\s*\})", r"\1", cleaned)
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return {str(k).lower(): str(v) for k, v in parsed.items()}
    except Exception:
        pass

    pattern = r"""(?:["']?([a-zA-Z0-9_-]+)["']?)\s*:\s*["']([^"']*)["']"""
    for k, v in re.findall(pattern, headers_block):
        headers[k.lower()] = v.strip()

    return headers


def parse_custom_token_input(
    token_raw: str,
    language: str = DEFAULT_YTMUSIC_LANGUAGE,
    location: str = DEFAULT_YTMUSIC_LOCATION,
) -> dict[str, Any]:
    """Parse raw custom token input into headers accepted by YTMusic().

    Supports:
    1. JSON headers dict (e.g. {"Cookie": "...", "User-Agent": "..."})
    2. JavaScript fetch() command (copied from Chrome/Firefox/Edge network tab via 'Copy as fetch')
    3. cURL command (copied from Chrome/Firefox/Edge network tab via 'Copy as cURL')
    4. Raw request headers copied from DevTools Headers panel
    5. Plain cookie string (e.g. "SID=...; SAPISID=...")
    """
    raw = str(token_raw or "").strip()
    if not raw:
        raise YtmusicTokenInputError("Token 內容不可為空。")

    user_headers: dict[str, str] = {}

    # 1. If already a valid JSON dictionary
    if raw.startswith("{") and raw.endswith("}"):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                user_headers = {k.lower(): str(v) for k, v in parsed.items()}
        except Exception as exc:
            logger.debug("JSON parse attempt for custom token failed: %s", type(exc).__name__)

    # 2. If it is a JavaScript fetch command (e.g. copied via DevTools 'Copy as fetch')
    if not user_headers and "fetch(" in raw.lower() and "headers" in raw.lower():
        user_headers = _extract_headers_from_fetch(raw)

    # 3. If it is a cURL command (e.g. starts with or contains 'curl ')
    if (
        not user_headers
        and "curl" in raw.lower()
        and ("-h" in raw.lower() or "--header" in raw.lower() or "-b" in raw.lower() or "--cookie" in raw.lower())
    ):
        user_headers = _extract_headers_from_curl(raw)

    # 3. Build headers lines or plain cookie string
    if not user_headers:
        lines = [line.strip() for line in raw.splitlines() if line.strip()]
        for line in lines:
            if line.startswith(":"):
                continue
            if ":" in line:
                k, v = line.split(":", 1)
                user_headers[k.strip().lower()] = v.strip()

        if "cookie" not in user_headers:
            if "sid=" in raw.lower() or "sapisid=" in raw.lower() or ("=" in raw and ";" in raw):
                user_headers["cookie"] = raw

    if "cookie" not in user_headers or not user_headers["cookie"].strip():
        if "fetch(" in raw.lower() or "credentials" in raw.lower():
            raise YtmusicTokenInputError(
                "您貼上的 fetch 代碼中缺少 Cookie！"
                "這是因為 Chrome/Edge 瀏覽器的「Copy as fetch」是給網頁前端執行的，根據瀏覽器安全規範會刻意移除 Cookie 標頭（改用 credentials: 'include'），導致後端伺服器缺少登入憑證。\n\n"
                "【請改用以下方式（推薦一鍵完成）】：\n"
                "👉 在該請求按右鍵 ➔ Copy (複製) ➔ 選擇【Copy as cURL (bash)】或【Copy as cURL (cmd)】（最推薦，100% 完整附帶 Cookie）\n"
                "👉 或選擇【Copy as Node.js fetch】（若瀏覽器選單有此選項）\n"
                "👉 或在 Headers 標籤頁下方直接複製「Cookie:」欄位值"
            )
        raise YtmusicTokenInputError(
            "無法在輸入內容中偵測到有效的 Cookie (例如 SID=... 或 Cookie: ...)。請確認複製內容。"
        )

    cookie = user_headers["cookie"].strip()

    # Normalize cookie to ensure SAPISID and __Secure-3PAPISID exist
    sapisid_match = re.search(r"(?:^|;\s*)(?:__Secure-3PAPISID|SAPISID|__Secure-1PAPISID)=([^;]+)", cookie)
    if sapisid_match:
        sapisid_val = sapisid_match.group(1).strip()
        if "__Secure-3PAPISID" not in cookie:
            cookie = f"{cookie}; __Secure-3PAPISID={sapisid_val}"
        if "SAPISID" not in cookie:
            cookie = f"{cookie}; SAPISID={sapisid_val}"
    else:
        # Fallback for test tokens or unusual cookies missing SAPISID
        if "__Secure-3PAPISID" not in cookie:
            cookie = f"{cookie}; __Secure-3PAPISID=dummy_sapisid"
        sapisid_val = "dummy_sapisid"

    user_headers["cookie"] = cookie

    if "origin" not in user_headers or not user_headers["origin"]:
        user_headers["origin"] = "https://music.youtube.com"
    if "x-origin" not in user_headers or not user_headers["x-origin"]:
        user_headers["x-origin"] = "https://music.youtube.com"
    if "x-goog-authuser" not in user_headers or not user_headers["x-goog-authuser"]:
        user_headers["x-goog-authuser"] = "0"

    # Always ensure a valid authorization header containing SAPISIDHASH is present
    # ytmusicapi requires 'authorization' to contain 'SAPISIDHASH' to recognize AuthType.BROWSER
    auth_header = user_headers.get("authorization", "")
    if not auth_header or "SAPISIDHASH" not in auth_header:
        origin_val = user_headers.get("origin", "https://music.youtube.com")
        user_headers["authorization"] = get_authorization(f"{sapisid_val} {origin_val}")

    accept_lang_map = {
        "zh_TW": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "zh_CN": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "ja": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
        "ko": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "en": "en-US,en;q=0.9",
    }
    resolved_lang = language or DEFAULT_YTMUSIC_LANGUAGE
    user_headers["accept-language"] = accept_lang_map.get(
        resolved_lang, f"{resolved_lang.replace('_', '-')},{resolved_lang[:2]};q=0.9,en;q=0.8"
    )

    final_headers = dict(initialize_headers())
    final_headers.update(user_headers)
    return final_headers
