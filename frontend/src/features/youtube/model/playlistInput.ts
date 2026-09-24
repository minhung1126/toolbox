const YOUTUBE_PLAYLIST_ID = /^[A-Za-z0-9_-]{1,128}$/;

function isValidYoutubePlaylistId(value: string) {
  return YOUTUBE_PLAYLIST_ID.test(value);
}

export function normalizeYoutubePlaylistInput(value: unknown): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  if (isValidYoutubePlaylistId(trimmed)) return trimmed;

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return '';
  }

  const hostname = parsed.hostname.toLowerCase();
  const isYoutubeHost = hostname === 'youtu.be' || hostname === 'youtube.com' || hostname.endsWith('.youtube.com');
  if (!isYoutubeHost || !['http:', 'https:'].includes(parsed.protocol)) return '';

  const playlistId = parsed.searchParams.get('list')?.trim() || '';
  return isValidYoutubePlaylistId(playlistId) ? playlistId : '';
}
