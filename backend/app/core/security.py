from typing import Any

from itsdangerous import BadData, BadSignature, URLSafeTimedSerializer

from backend.app.core.config import get_settings, settings

GOOGLE_OAUTH_STATE_SALT = "google-oauth-state"


def sign_timed_data(data: dict[str, Any], salt: str) -> str:
    """Sign short-lived, non-session state for a single OAuth flow."""
    config = get_settings(settings)
    config.initialize_keys()
    return URLSafeTimedSerializer(config.SECRET_KEY).dumps(data, salt=salt)


def verify_timed_data(token_str: str, salt: str, max_age: int) -> dict | None:
    """Verify and decode short-lived signed data."""
    try:
        config = get_settings(settings)
        config.initialize_keys()
        data = URLSafeTimedSerializer(config.SECRET_KEY).loads(token_str, max_age=max_age, salt=salt)
        return data
    except (BadSignature, BadData):
        return None
