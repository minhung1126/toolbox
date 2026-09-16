const AUTH_HASH_KEYS = [
  ['auth_success', 'google_success'],
  ['auth_error', 'google_error'],
  ['sheets_auth_success', 'sheets_success'],
  ['sheets_auth_error', 'sheets_error'],
  ['drive_auth_success', 'drive_success'],
  ['drive_auth_error', 'drive_error'],
  ['youtube_auth_success', 'youtube_success'],
  ['youtube_auth_error', 'youtube_error'],
  ['ytmusic_auth_success', 'ytmusic_success'],
  ['ytmusic_auth_error', 'ytmusic_error'],
];

export function parseAuthHash(hash = window.location.hash) {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(value);
  for (const [key, type] of AUTH_HASH_KEYS) {
    if (params.has(key)) {
      return { type, value: params.get(key) || '' };
    }
  }
  return null;
}

export function clearAuthHash() {
  window.history.replaceState(
    window.history.state,
    document.title,
    `${window.location.pathname}${window.location.search}`,
  );
}
