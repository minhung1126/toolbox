import logging
from datetime import datetime, timedelta, timezone
from threading import Lock, RLock
from typing import Callable, Optional
from weakref import WeakKeyDictionary

from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from oauthlib.oauth2.rfc6749.tokens import OAuth2Token

from backend.app.core.config import get_settings, normalize_youtube_slot, settings
from backend.app.core.credential_store import CredentialStore, _request_store, credential_store, get_credential_store
from backend.app.core.session_store import get_session_store, session_store
from backend.app.services.google_clients import build_google_client
from backend.app.services.oauth_clients import get_oauth_flow_factory, get_refresh_request_factory
from backend.app.services.youtube_quota_service import get_youtube_quota_tracker

logger = logging.getLogger(__name__)

SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"

LOGIN_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]
SHEETS_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    SHEETS_READONLY_SCOPE,
]
YOUTUBE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/youtube",
]
GOOGLE_TOKEN_REFRESH_WINDOW = timedelta(minutes=5)
GOOGLE_TOKEN_REFRESH_RETRY_DELAY = timedelta(minutes=1)
GOOGLE_TOKEN_REFRESH_TIMEOUT_SECONDS = 10

_refresh_locks_guard = Lock()
_store_refresh_locks: WeakKeyDictionary[object, dict[tuple[str, str, str], RLock]] = WeakKeyDictionary()
_fallback_refresh_locks: dict[tuple[int, str, str, str], RLock] = {}


def _get_refresh_lock(
    store: object,
    owner_sub: str,
    credential_key: str,
    slot: str = "primary",
) -> RLock:
    slot_key = normalize_youtube_slot(slot) if credential_key == "youtube" else "primary"
    bucket_key = (str(owner_sub or ""), str(credential_key or "google"), slot_key)
    with _refresh_locks_guard:
        try:
            store_locks = _store_refresh_locks.get(store)
            if store_locks is None:
                store_locks = {}
                _store_refresh_locks[store] = store_locks
            lock = store_locks.get(bucket_key)
            if lock is None:
                lock = RLock()
                store_locks[bucket_key] = lock
            return lock
        except TypeError:
            fallback_key = (id(store), *bucket_key)
            lock = _fallback_refresh_locks.get(fallback_key)
            if lock is None:
                lock = RLock()
                _fallback_refresh_locks[fallback_key] = lock
            return lock


class _TimeoutRefreshRequest(Request):
    """Requests transport wrapper enforcing an explicit OAuth refresh timeout."""

    def __init__(self, session=None, *, timeout: float = GOOGLE_TOKEN_REFRESH_TIMEOUT_SECONDS):
        super().__init__(session=session)
        self.timeout = timeout

    def __call__(self, url, method="GET", body=None, headers=None, timeout=None, **kwargs):
        effective_timeout = self.timeout if timeout is None else timeout
        return super().__call__(url, method=method, body=body, headers=headers, timeout=effective_timeout, **kwargs)


def _default_refresh_request() -> Request:
    return _TimeoutRefreshRequest()


def has_sheets_scope(credentials: Credentials | None) -> bool:
    """Return whether credentials include the Sheets read-only scope."""
    if credentials is None:
        return False
    scopes = getattr(credentials, "scopes", None) or []
    return SHEETS_READONLY_SCOPE in {str(scope).strip() for scope in scopes}


YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube"


def has_youtube_scope(credentials: Credentials | None) -> bool:
    """Return whether credentials include the full YouTube scope."""
    if credentials is None:
        return False
    scopes = getattr(credentials, "scopes", None) or []
    return YOUTUBE_SCOPE in {str(scope).strip() for scope in scopes}


def login_scope_status(
    credentials: Credentials | None,
    sheets_credentials: Credentials | None = None,
    ytmusic_credentials: Credentials | None = None,
) -> dict[str, object]:
    """Expose only non-sensitive OAuth scope state to the authenticated UI."""
    all_scopes: set[str] = set()
    for creds in (credentials, sheets_credentials, ytmusic_credentials):
        if creds:
            all_scopes.update(
                str(scope).strip() for scope in (getattr(creds, "scopes", None) or []) if str(scope).strip()
            )

    sheets_ok = has_sheets_scope(sheets_credentials) or has_sheets_scope(credentials)
    ytmusic_ok = has_youtube_scope(ytmusic_credentials)

    return {
        "scopes": sorted(all_scopes),
        "sheets_readonly": sheets_ok,
        "sheets_reauthorization_required": bool(credentials and not sheets_ok),
        "ytmusic_authorized": ytmusic_ok,
    }


def get_client_config(purpose: str = "login", slot: str = "primary") -> dict:
    """Build the OAuth client config for login, sheets, ytmusic, or one YouTube slot."""
    if purpose == "youtube":
        youtube_slot = get_settings(settings).youtube_oauth_slot(normalize_youtube_slot(slot))
        client_id = youtube_slot.client_id
        client_secret = youtube_slot.client_secret
    elif purpose in ("login", "sheets", "ytmusic"):
        client_id = get_settings(settings).GOOGLE_CLIENT_ID
        client_secret = get_settings(settings).GOOGLE_CLIENT_SECRET
    else:
        raise ValueError(f"不支援的 Google OAuth 用途：{purpose}")
    return {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "redirect_uris": [get_settings(settings).get_redirect_uri()],
        }
    }


def _scopes_for(purpose: str) -> list[str]:
    if purpose in ("youtube", "ytmusic"):
        return YOUTUBE_SCOPES
    if purpose == "login":
        return LOGIN_SCOPES
    if purpose == "sheets":
        return SHEETS_SCOPES
    raise ValueError(f"不支援的 Google OAuth 用途：{purpose}")


def create_oauth_flow(
    code_verifier: Optional[str] = None,
    purpose: str = "login",
    slot: str = "primary",
) -> Flow:
    """Create a PKCE OAuth flow for login, sheets, ytmusic, or one YouTube slot."""
    slot_name = normalize_youtube_slot(slot) if purpose == "youtube" else "primary"
    config = get_client_config(purpose=purpose, slot=slot_name)
    redirect_uri = get_settings(settings).get_redirect_uri()

    # Provider authorization/token endpoints use HTTPS, including local callback flows.
    flow = get_oauth_flow_factory(Flow.from_client_config)(
        config,
        scopes=_scopes_for(purpose),
        redirect_uri=redirect_uri,
        code_verifier=code_verifier,
        autogenerate_code_verifier=code_verifier is None,
    )
    return flow


def get_auth_url(purpose: str = "login", slot: str = "primary") -> tuple[str, str, str]:
    """Generate a Google OAuth URL and return its PKCE state."""
    slot_name = normalize_youtube_slot(slot) if purpose == "youtube" else "primary"
    flow = create_oauth_flow(purpose=purpose, slot=slot_name)
    prompt = "consent select_account" if purpose in ("youtube", "ytmusic", "sheets") else "consent"
    auth_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt=prompt,
    )
    if not flow.code_verifier:
        raise RuntimeError("Google OAuth PKCE code verifier 未建立。")
    return auth_url, state, flow.code_verifier


def exchange_code_for_tokens(
    code: str,
    code_verifier: str,
    purpose: str = "login",
    slot: str = "primary",
) -> dict:
    """Exchange an authorization code with the matching flow and PKCE verifier."""
    slot_name = normalize_youtube_slot(slot) if purpose == "youtube" else "primary"
    flow = create_oauth_flow(code_verifier=code_verifier, purpose=purpose, slot=slot_name)
    try:
        flow.fetch_token(code=code)
    except Warning as exc:
        # Incremental Google consent can return previously granted scopes too.
        # OAuthLib raises after validating the token but before saving it to the
        # session. Recover only a scope expansion; never redeem the code twice
        # or disable scope validation globally for concurrent OAuth flows.
        token = getattr(exc, "token", None)
        if not isinstance(token, OAuth2Token) or not token.scope_changed:
            raise
        if not set(_scopes_for(purpose)).issubset(token.scopes):
            raise
        flow.oauth2session.token = token
        logger.info("Google OAuth accepted additional granted scopes (%s/%s)", purpose, slot_name)
    creds = flow.credentials

    token_dict = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes) if creds.scopes else [],
        "expiry": creds.expiry.isoformat() if creds.expiry else None,
    }

    # Fetch user profile using credentials
    user_info = get_user_profile(creds)
    token_dict["user"] = user_info

    if purpose == "youtube":
        channel = get_youtube_channel_info(creds, slot=slot_name)
        token_dict.update(
            {
                "channel_id": channel["channel_id"],
                "channel_title": channel.get("channel_title") or "",
            }
        )
    elif purpose in ("ytmusic"):
        try:
            channel = get_youtube_channel_info(creds, slot="primary")
            token_dict.update(
                {
                    "channel_id": channel["channel_id"],
                    "channel_title": channel.get("channel_title") or "",
                }
            )
        except Exception:
            logger.info("No explicit YouTube channel found for %s, using profile info", purpose)

    return token_dict


def get_youtube_channel_info(credentials: Credentials, *, slot: str = "primary") -> dict[str, str]:
    """Verify and return the channel represented by a YouTube OAuth token."""
    slot_name = normalize_youtube_slot(slot)
    service = build_google_client("youtube", "v3", credentials=credentials)
    request = service.channels().list(part="id,snippet", mine=True, maxResults=1)
    response = get_youtube_quota_tracker(slot_name).execute(request, "channels.list")
    items = response.get("items") if isinstance(response, dict) else None
    channel = items[0] if isinstance(items, list) and items else None
    channel_id = str((channel or {}).get("id") or "").strip()
    if not channel_id:
        raise RuntimeError("授權的 Google 帳號沒有可存取的 YouTube 頻道。")
    snippet = (channel or {}).get("snippet") or {}
    return {
        "channel_id": channel_id,
        "channel_title": str(snippet.get("title") or "").strip(),
    }


def get_user_profile(credentials: Credentials) -> dict:
    """Fetch the authenticated user's profile information."""
    try:
        service = build_google_client("oauth2", "v2", credentials=credentials)
        user_info = service.userinfo().get().execute()
        return {
            # The v2 userinfo endpoint exposes Google's stable OIDC subject as
            # ``id``. Keep both spellings accepted for test doubles/providers.
            "sub": user_info.get("sub") or user_info.get("id", ""),
            "email": user_info.get("email", ""),
            "name": user_info.get("name", ""),
            "picture": user_info.get("picture", ""),
        }
    except Exception as e:
        logger.error("Error fetching user profile: %s", type(e).__name__)
        return {"sub": "", "email": "Connected Account", "name": "", "picture": ""}


def _normalize_expiry(expiry: Optional[datetime]) -> Optional[datetime]:
    if expiry is not None and expiry.tzinfo is not None:
        return expiry.astimezone(timezone.utc).replace(tzinfo=None)
    return expiry


def _sync_credentials_attrs(target: Credentials, source: Credentials) -> None:
    target.token = source.token
    target.expiry = _normalize_expiry(source.expiry)
    target._refresh_token = source._refresh_token
    target._id_token = source._id_token
    target._rapt_token = source._rapt_token
    target._granted_scopes = source._granted_scopes
    source_scopes = getattr(source, "_scopes", None)
    if source_scopes is not None:
        target._scopes = list(source_scopes)


class _ManagedCredentials(Credentials):
    """Credentials subclass routing implicit AuthorizedHttp refreshes through per-key locks and persistence."""

    def __init__(
        self,
        *args,
        owner_sub: Optional[str] = None,
        credential_key: str = "google",
        slot: str = "primary",
        bound_store: Optional[CredentialStore] = None,
        token_record: Optional[dict] = None,
        **kwargs,
    ):
        super().__init__(*args, **kwargs)
        self._owner_sub = owner_sub
        self._credential_key = credential_key
        self._slot = slot
        self._bound_store = bound_store
        self._token_record = dict(token_record) if isinstance(token_record, dict) else {}

    def _make_copy(self):
        cred = super()._make_copy()
        cred._owner_sub = self._owner_sub
        cred._credential_key = self._credential_key
        cred._slot = self._slot
        cred._bound_store = self._bound_store
        cred._token_record = dict(self._token_record)
        return cred

    def __setstate__(self, d):
        super().__setstate__(d)
        self._owner_sub = d.get("_owner_sub")
        self._credential_key = d.get("_credential_key", "google")
        self._slot = d.get("_slot", "primary")
        self._bound_store = d.get("_bound_store")
        token_record = d.get("_token_record")
        self._token_record = dict(token_record) if isinstance(token_record, dict) else {}

    def refresh(self, request=None):
        if not self._owner_sub:
            injected_factory = get_refresh_request_factory(None)
            if injected_factory is not None:
                transport = injected_factory()
            elif request is None or type(request).__module__.startswith("google_auth_httplib2"):
                transport = _default_refresh_request()
            else:
                transport = request
            return Credentials.refresh(self, transport)
        return _refresh_managed_credentials(self, request=request)


def _build_credentials(
    token_dict: dict,
    *,
    purpose: str = "login",
    slot: str = "primary",
    owner_sub: Optional[str] = None,
    credential_key: Optional[str] = None,
    bound_store: Optional[CredentialStore] = None,
) -> Credentials:
    expiry = token_dict.get("expiry")
    parsed_expiry = None
    if expiry:
        try:
            parsed_expiry = datetime.fromisoformat(expiry)
            parsed_expiry = _normalize_expiry(parsed_expiry)
        except (TypeError, ValueError):
            parsed_expiry = None
    if purpose == "youtube":
        youtube_slot = get_settings(settings).youtube_oauth_slot(normalize_youtube_slot(slot))
        client_id = youtube_slot.client_id
        client_secret = youtube_slot.client_secret
    else:
        client_id = token_dict.get("client_id") or get_settings(settings).GOOGLE_CLIENT_ID
        client_secret = get_settings(settings).GOOGLE_CLIENT_SECRET
    resolved_key = credential_key or ("youtube" if purpose == "youtube" else "google")
    resolved_store = bound_store if bound_store is not None else _request_store.get()
    return _ManagedCredentials(
        token=token_dict.get("token"),
        refresh_token=token_dict.get("refresh_token"),
        token_uri=token_dict.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=client_id,
        client_secret=client_secret,
        # A legacy token without a persisted scope list must not be treated as
        # having elevated scopes; the UI will ask for reauth.
        scopes=token_dict.get("scopes") or [],
        expiry=parsed_expiry,
        owner_sub=owner_sub,
        credential_key=resolved_key,
        slot=slot,
        bound_store=resolved_store,
        token_record=token_dict,
    )


def _needs_refresh(credentials: Credentials) -> bool:
    if not credentials.refresh_token:
        return False
    if credentials.expired:
        return True
    if not credentials.expiry:
        return False
    expiry = credentials.expiry
    if expiry.tzinfo:
        now = datetime.now(timezone.utc)
    else:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
    return expiry - now <= GOOGLE_TOKEN_REFRESH_WINDOW


def _safe_load_credentials(
    loader: Callable[[], Optional[dict]],
    *,
    label: str,
    owner_sub: str,
) -> Optional[dict]:
    try:
        return loader()
    except RuntimeError:
        logger.warning(
            "Stored %s credentials could not be decrypted for subject %s; reauthorization required",
            label,
            owner_sub,
        )
        return None


def _load_stored_record(
    store: CredentialStore,
    *,
    owner_sub: str,
    credential_key: str,
    slot: str,
) -> tuple[Optional[dict], dict]:
    if credential_key == "youtube":
        latest = _safe_load_credentials(
            lambda: store.get_youtube_credentials(owner_sub, slot=slot),
            label=f"youtube:{slot}",
            owner_sub=owner_sub,
        )
        public = store.get_youtube_public(owner_sub, slot=slot)
    elif credential_key == "ytmusic":
        latest = _safe_load_credentials(
            lambda: store.get_ytmusic_credentials(owner_sub),
            label="ytmusic",
            owner_sub=owner_sub,
        )
        public = store.get_ytmusic_public(owner_sub)
    elif credential_key == "sheets":
        latest = _safe_load_credentials(
            lambda: store.get_sheets_credentials(owner_sub),
            label="sheets",
            owner_sub=owner_sub,
        )
        public = store.get_sheets_public(owner_sub)
    else:
        latest = _safe_load_credentials(
            lambda: store.get_google_credentials(owner_sub),
            label="google",
            owner_sub=owner_sub,
        )
        public = store.get_google_public(owner_sub)
    return latest, public or {}


def _save_refreshed_record(
    store: CredentialStore,
    *,
    owner_sub: str,
    credential_key: str,
    slot: str,
    refreshed: dict,
) -> None:
    if credential_key == "youtube":
        store.save_youtube_connection(refreshed, owner_sub=owner_sub, slot=slot)
    elif credential_key == "ytmusic":
        store.save_ytmusic_connection(refreshed, owner_sub=owner_sub)
    elif credential_key == "sheets":
        store.save_sheets_connection(refreshed, owner_sub=owner_sub)
    else:
        store.save_google_connection(refreshed, owner_sub=owner_sub)


def _mark_refresh_failure(
    store: CredentialStore,
    *,
    owner_sub: str,
    credential_key: str,
    slot: str,
    exc: Exception,
) -> bool:
    raw_message = str(exc).casefold()
    is_refresh_error = isinstance(exc, RefreshError)
    requires_reauthorization = is_refresh_error and any(
        marker in raw_message
        for marker in ("invalid_grant", "invalid_client", "invalid client", "unauthorized_client", "revoked")
    )
    # Never persist or expose the provider's raw response body. The
    # status is enough for the UI; diagnostics retain only the type.
    message = "Google OAuth 憑證需要重新授權。" if requires_reauthorization else "Google OAuth 憑證更新失敗。"
    if credential_key == "youtube":
        store.mark_youtube_refresh_failed(
            message,
            owner_sub=owner_sub,
            slot=slot,
            requires_reauthorization=requires_reauthorization,
        )
    elif credential_key == "ytmusic":
        store.mark_ytmusic_refresh_failed(
            message,
            owner_sub=owner_sub,
            requires_reauthorization=requires_reauthorization,
        )
    elif credential_key == "sheets":
        store.mark_sheets_refresh_failed(
            message, owner_sub=owner_sub, requires_reauthorization=requires_reauthorization
        )
    else:
        store.mark_google_refresh_failed(
            message, owner_sub=owner_sub, requires_reauthorization=requires_reauthorization
        )
    logger.log(
        logging.WARNING if requires_reauthorization else logging.ERROR,
        "Failed to refresh Google token (%s/%s): %s status=%s",
        credential_key,
        slot,
        type(exc).__name__,
        "reauthorization_required" if requires_reauthorization else "refresh_failed",
    )
    return requires_reauthorization


def _in_refresh_cooldown(public: dict) -> bool:
    if public.get("status") != "refresh_failed":
        return False
    try:
        failed_at = datetime.fromisoformat(public["last_refresh_failed_at"])
        if failed_at.tzinfo is None:
            failed_at = failed_at.replace(tzinfo=timezone.utc)
    except (KeyError, TypeError, ValueError):
        return False
    return datetime.now(timezone.utc) - failed_at < GOOGLE_TOKEN_REFRESH_RETRY_DELAY


def _resolve_effective_key(store: CredentialStore, owner_sub: str, credential_key: str) -> str:
    if credential_key == "sheets":
        has_dedicated = _safe_load_credentials(
            lambda: store.get_sheets_credentials(owner_sub),
            label="sheets",
            owner_sub=owner_sub,
        )
        if not has_dedicated:
            return "google"
    return credential_key


def _select_refresh_transport(request=None):
    injected_factory = get_refresh_request_factory(None)
    if injected_factory is not None:
        return injected_factory()
    if request is None or type(request).__module__.startswith("google_auth_httplib2"):
        return _default_refresh_request()
    return request


def _refresh_managed_credentials(creds: _ManagedCredentials, *, request=None) -> None:
    owner_sub = str(creds._owner_sub or "").strip()
    active_store = get_credential_store(creds._bound_store or credential_store)
    effective_key = _resolve_effective_key(active_store, owner_sub, creds._credential_key)
    slot = normalize_youtube_slot(creds._slot) if effective_key == "youtube" else "primary"

    for _attempt in range(2):
        lock = _get_refresh_lock(active_store, owner_sub, effective_key, slot)
        with lock:
            latest, public = _load_stored_record(
                active_store, owner_sub=owner_sub, credential_key=effective_key, slot=slot
            )
            if effective_key == "sheets" and not latest:
                effective_key = "google"
                slot = "primary"
                continue

            active_dict = (
                latest
                or dict(creds._token_record)
                or {
                    "token": creds.token,
                    "refresh_token": creds.refresh_token,
                    "token_uri": creds.token_uri,
                    "client_id": creds.client_id,
                    "scopes": list(creds.scopes) if creds.scopes else [],
                    "expiry": creds.expiry.isoformat() if creds.expiry else None,
                }
            )
            purpose = "youtube" if effective_key == "youtube" else "login"
            latest_creds = _build_credentials(
                active_dict,
                purpose=purpose,
                slot=slot,
                owner_sub=owner_sub,
                credential_key=effective_key,
                bound_store=active_store,
            )

            if public.get("status") == "reauthorization_required":
                raise RefreshError("Google OAuth 憑證需要重新授權。")
            if _in_refresh_cooldown(public):
                raise RefreshError("Google OAuth 憑證更新失敗。")

            # If another thread already refreshed this credential in the store,
            # adopt the fresh token instead of issuing a redundant OAuth POST.
            if latest and latest_creds.token != creds.token and latest_creds.valid and not _needs_refresh(latest_creds):
                _sync_credentials_attrs(creds, latest_creds)
                creds._token_record = dict(active_dict)
                return

            transport = _select_refresh_transport(request)
            try:
                Credentials.refresh(latest_creds, transport)
                refreshed = dict(active_dict)
                refreshed["token"] = latest_creds.token
                refreshed["refresh_token"] = latest_creds.refresh_token or active_dict.get("refresh_token")
                refreshed["expiry"] = latest_creds.expiry.isoformat() if latest_creds.expiry else None
                _save_refreshed_record(
                    active_store,
                    owner_sub=owner_sub,
                    credential_key=effective_key,
                    slot=slot,
                    refreshed=refreshed,
                )
                _sync_credentials_attrs(creds, latest_creds)
                creds._token_record = refreshed
                return
            except Exception as exc:
                _mark_refresh_failure(
                    active_store,
                    owner_sub=owner_sub,
                    credential_key=effective_key,
                    slot=slot,
                    exc=exc,
                )
                raise


def _refresh_credentials(
    token_dict: dict,
    *,
    owner_sub: str,
    credential_key: str = "google",
    slot: str = "primary",
    bound_store: Optional[CredentialStore] = None,
) -> Optional[Credentials]:
    """Refresh under a per-(store, owner_sub, credential_key, slot) lock and persist atomically."""
    active_store = get_credential_store(bound_store or credential_store)
    effective_key = _resolve_effective_key(active_store, owner_sub, credential_key)
    slot_name = normalize_youtube_slot(slot) if effective_key == "youtube" else "primary"

    for _attempt in range(2):
        lock = _get_refresh_lock(active_store, owner_sub, effective_key, slot_name)
        with lock:
            # Another request may have refreshed the persistent record while this
            # request was waiting for the lock. Always use the newest record.
            latest, public = _load_stored_record(
                active_store, owner_sub=owner_sub, credential_key=effective_key, slot=slot_name
            )
            if effective_key == "sheets" and not latest:
                effective_key = "google"
                slot_name = "primary"
                continue

            active_dict = latest or token_dict
            purpose = "youtube" if effective_key == "youtube" else "login"
            credentials = _build_credentials(
                active_dict,
                purpose=purpose,
                slot=slot_name,
                owner_sub=owner_sub,
                credential_key=effective_key,
                bound_store=active_store,
            )
            # Revoked refresh tokens cannot recover without a new OAuth grant.
            # Persisted state also prevents retries through service fallbacks and
            # after a restart; saving a new connection resets the failure state.
            if public.get("status") == "reauthorization_required":
                return None
            if _in_refresh_cooldown(public):
                return credentials
            if not _needs_refresh(credentials):
                return credentials

            try:
                Credentials.refresh(credentials, get_refresh_request_factory(_default_refresh_request)())
                refreshed = dict(active_dict)
                refreshed["token"] = credentials.token
                refreshed["refresh_token"] = credentials.refresh_token or active_dict.get("refresh_token")
                refreshed["expiry"] = credentials.expiry.isoformat() if credentials.expiry else None
                _save_refreshed_record(
                    active_store,
                    owner_sub=owner_sub,
                    credential_key=effective_key,
                    slot=slot_name,
                    refreshed=refreshed,
                )
                return credentials
            except Exception as exc:
                requires_reauthorization = _mark_refresh_failure(
                    active_store,
                    owner_sub=owner_sub,
                    credential_key=effective_key,
                    slot=slot_name,
                    exc=exc,
                )
                return None if requires_reauthorization else credentials
    return None


def build_credentials_from_dict(
    token_dict: dict,
    *,
    credential_key: str = "google",
    owner_sub: str,
    slot: str = "primary",
) -> Optional[Credentials]:
    """Reconstruct credentials and proactively refresh them before expiry."""
    purpose = "youtube" if credential_key == "youtube" else "login"
    bound_store = _request_store.get()
    credentials = _build_credentials(
        token_dict,
        purpose=purpose,
        slot=slot,
        owner_sub=owner_sub,
        credential_key=credential_key,
        bound_store=bound_store,
    )
    if _needs_refresh(credentials):
        return _refresh_credentials(
            token_dict,
            owner_sub=owner_sub,
            credential_key=credential_key,
            slot=slot,
            bound_store=bound_store,
        )
    return credentials


def get_login_credentials(session_id: Optional[str] = None) -> Optional[Credentials]:
    """Load control-panel login credentials for one server session."""
    if not session_id:
        return None
    session_data = get_session_store(session_store).get(session_id)
    if not session_data:
        return None

    session_user = session_data.get("user") if isinstance(session_data.get("user"), dict) else {}
    session_sub = str(session_user.get("sub") or "").strip() or None

    # New sessions contain only an account reference. OAuth credentials live in
    # the encrypted persistent credential store and survive session rotation or
    # a backend restart.
    if session_data.get("credential_provider") != "google_login" or not session_sub:
        return None
    token_dict = _safe_load_credentials(
        lambda: get_credential_store(credential_store).get_google_credentials(session_sub),
        label="google",
        owner_sub=session_sub,
    )
    if not token_dict or not token_dict.get("token"):
        return None
    credential_user = token_dict.get("user") if isinstance(token_dict.get("user"), dict) else {}
    credential_sub = str(credential_user.get("sub") or credential_user.get("id") or "").strip()
    if credential_sub != session_sub:
        return None
    return build_credentials_from_dict(token_dict, credential_key="google", owner_sub=session_sub)


def _resolve_owner_sub(session_id: Optional[str] = None, owner_sub: Optional[str] = None) -> Optional[str]:
    if owner_sub:
        return str(owner_sub).strip() or None
    if not session_id:
        return None
    session_data = get_session_store(session_store).get(session_id)
    if not session_data or session_data.get("credential_provider") != "google_login":
        return None
    session_user = session_data.get("user") if isinstance(session_data.get("user"), dict) else {}
    return str(session_user.get("sub") or "").strip() or None


def _get_scoped_service_credentials(
    session_id: Optional[str],
    owner_sub: Optional[str],
    *,
    credential_key: str,
    scope_checker: Callable[[Optional[Credentials]], bool],
    dedicated_getter: Callable[[str], Optional[Credentials]],
) -> Optional[Credentials]:
    sub = _resolve_owner_sub(session_id=session_id, owner_sub=owner_sub)
    if not sub:
        return None
    # 1. Dedicated service credentials
    token_dict = _safe_load_credentials(lambda: dedicated_getter(sub), label=credential_key, owner_sub=sub)
    if token_dict and token_dict.get("token"):
        creds = build_credentials_from_dict(token_dict, credential_key=credential_key, owner_sub=sub)
        if creds and creds.valid and scope_checker(creds):
            return creds

    # 2. Fallback to youtube connection if checking ytmusic
    if credential_key == "ytmusic":
        yt_dict = _safe_load_credentials(
            lambda: get_credential_store(credential_store).get_youtube_credentials(sub, slot="primary"),
            label="youtube:primary",
            owner_sub=sub,
        )
        if yt_dict and yt_dict.get("token"):
            creds = build_credentials_from_dict(yt_dict, credential_key="youtube", owner_sub=sub, slot="primary")
            if creds and creds.valid and scope_checker(creds):
                return creds

    # 3. Fallback to legacy google login connection if it includes required scope
    legacy_dict = _safe_load_credentials(
        lambda: get_credential_store(credential_store).get_google_credentials(sub),
        label="google_fallback",
        owner_sub=sub,
    )
    if legacy_dict and legacy_dict.get("token"):
        creds = build_credentials_from_dict(legacy_dict, credential_key="google", owner_sub=sub)
        if creds and creds.valid and scope_checker(creds):
            return creds

    return None


def get_sheets_credentials(session_id: Optional[str] = None, owner_sub: Optional[str] = None) -> Optional[Credentials]:
    """Load Google Sheets credentials for an authenticated user session or subject."""
    return _get_scoped_service_credentials(
        session_id=session_id,
        owner_sub=owner_sub,
        credential_key="sheets",
        scope_checker=has_sheets_scope,
        dedicated_getter=get_credential_store(credential_store).get_sheets_credentials,
    )


def get_ytmusic_credentials(session_id: Optional[str] = None, owner_sub: Optional[str] = None) -> Optional[Credentials]:
    """Load dedicated YouTube Music credentials for an authenticated user session or subject."""
    return _get_scoped_service_credentials(
        session_id=session_id,
        owner_sub=owner_sub,
        credential_key="ytmusic",
        scope_checker=has_youtube_scope,
        dedicated_getter=get_credential_store(credential_store).get_ytmusic_credentials,
    )


def get_youtube_credentials(session_id: Optional[str] = None, slot: str = "primary") -> Optional[Credentials]:
    """Load one separately authorized YouTube connection for a login session."""
    slot_name = normalize_youtube_slot(slot)
    session_data = get_session_store(session_store).get(session_id) if session_id else None
    session_user = session_data.get("user") if isinstance(session_data, dict) else None
    owner_sub = str((session_user or {}).get("sub") or "").strip() or None
    if not owner_sub:
        return None
    login_credentials = get_login_credentials(session_id)
    if not session_id or not login_credentials or not login_credentials.valid:
        return None
    token_dict = _safe_load_credentials(
        lambda: get_credential_store(credential_store).get_youtube_credentials(owner_sub, slot=slot_name),
        label=f"youtube:{slot_name}",
        owner_sub=owner_sub,
    )
    if not token_dict or not token_dict.get("token"):
        return None
    return build_credentials_from_dict(
        token_dict,
        credential_key="youtube",
        owner_sub=owner_sub,
        slot=slot_name,
    )
