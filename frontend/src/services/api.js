const API_BASE = '/api/v1';
const DEFAULT_TIMEOUT_MS = 45_000;
const YOUTUBE_WORKFLOW_TIMEOUT_MS = 10 * 60_000;
const SESSION_EXPIRED_DEDUP_MS = 1_000;
const YOUTUBE_PLAYLIST_ID = /^[A-Za-z0-9_-]{1,128}$/;
let lastSessionExpiredNotificationAt = 0;

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'request_failed', details = null, retryAfter = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfter = retryAfter;
  }
}

function isValidYoutubePlaylistId(value) {
  return YOUTUBE_PLAYLIST_ID.test(value);
}

export function normalizeYoutubePlaylistInput(value) {
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
  const isYoutubeHost = hostname === 'youtu.be'
    || hostname === 'youtube.com'
    || hostname.endsWith('.youtube.com');
  if (!isYoutubeHost || !['http:', 'https:'].includes(parsed.protocol)) return '';

  const playlistId = parsed.searchParams.get('list')?.trim() || '';
  return isValidYoutubePlaylistId(playlistId) ? playlistId : '';
}

function parseRetryAfter(value, now = Date.now()) {
  if (value === undefined || value === null || value === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const timestamp = Date.parse(String(value));
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.ceil((timestamp - now) / 1000));
}

function responseHeader(response, name) {
  try {
    return response?.headers?.get?.(name)
      || response?.headers?.[name]
      || response?.headers?.[name.toLowerCase()]
      || null;
  } catch {
    return null;
  }
}

function payloadDetail(data) {
  if (data?.detail && typeof data.detail === 'object') return data.detail;
  if (data?.details && typeof data.details === 'object') return data.details;
  if (data?.error && typeof data.error === 'object') return data.error;
  return null;
}

function payloadCode(data, status) {
  const detail = payloadDetail(data);
  return detail?.code || data?.code || data?.error_code || (status === 401 ? 'session_expired' : 'request_failed');
}

function payloadRetryAfter(data, response) {
  const headerValue = responseHeader(response, 'Retry-After');
  const detail = payloadDetail(data);
  const bodyValue = detail?.retry_after_seconds
    ?? detail?.retry_after
    ?? data?.retry_after_seconds
    ?? data?.retry_after;
  return parseRetryAfter(headerValue ?? bodyValue);
}

function responseMessage(data, status, retryAfter = null) {
  const detail = data?.detail;
  const rawText = typeof data?.__raw_response_text === 'string' ? data.__raw_response_text.trim() : '';
  const safeRawText = rawText && !/<\/?[a-z][^>]*>/i.test(rawText) ? rawText : '';
  const chineseMessage = [
    typeof detail === 'string' ? detail : '',
    detail && typeof detail === 'object' ? detail.message : '',
    data?.message,
    safeRawText,
  ].find((candidate) => typeof candidate === 'string' && candidate.trim() && /[\u4e00-\u9fff]/.test(candidate));
  if (chineseMessage) return chineseMessage.trim();
  if (status === 401) return '登入已逾時，請重新登入後再試。';
  if (status === 403) return '目前帳號沒有執行此操作的權限。';
  if (status === 429) {
    return retryAfter === null
      ? '服務目前忙碌或已達 API 用量限制，請稍後再試。'
      : `服務目前忙碌或已達 API 用量限制，請約 ${retryAfter} 秒後再試。`;
  }
  if (status >= 500) return '伺服器暫時無法處理，請稍後按「重試」。';
  return `操作失敗（HTTP ${status}），請重試。`;
}

async function readResponseData(response) {
  if (typeof response?.text === 'function') {
    let raw;
    try {
      raw = await response.text();
    } catch {
      return {};
    }
    if (typeof raw !== 'string' || !raw.trim()) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return { __raw_response_text: raw };
    }
  }
  try {
    return response?.json ? await response.json() : {};
  } catch {
    return {};
  }
}

function announceSessionExpired() {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (lastSessionExpiredNotificationAt && now - lastSessionExpiredNotificationAt < SESSION_EXPIRED_DEDUP_MS) return;
  lastSessionExpiredNotificationAt = now;
  window.dispatchEvent(new CustomEvent('creator-tools:session-expired'));
}

export function resetSessionExpiredNotification() {
  lastSessionExpiredNotificationAt = 0;
}

function normalizeYoutubeSettingsPayload(payload = {}) {
  const next = { ...payload };
  if (Object.prototype.hasOwnProperty.call(next, 'default_playlist_id')) {
    const original = String(next.default_playlist_id ?? '').trim();
    const normalized = normalizeYoutubePlaylistInput(original);
    if (original && !normalized) {
      throw new ApiError('請輸入合法的 YouTube 播放清單網址或 ID。', {
        code: 'invalid_youtube_playlist',
        details: { value: original },
      });
    }
    next.default_playlist_id = normalized;
  }
  return next;
}

function normalizedYoutubePlaylistOrOriginal(value) {
  const raw = String(value ?? '').trim();
  return normalizeYoutubePlaylistInput(raw) || raw;
}

function hideUnavailableSecondarySlot(data) {
  const slots = data?.youtube?.slots;
  const secondary = slots?.secondary;
  if (!slots || !secondary || (secondary.enabled && secondary.configured)) return data;
  const nextSlots = { ...slots };
  delete nextSlots.secondary;
  const activeSlot = nextSlots[data.youtube.active_slot] ? data.youtube.active_slot : (nextSlots.primary ? 'primary' : data.youtube.active_slot);
  return { ...data, youtube: { ...data.youtube, active_slot: activeSlot, slots: nextSlots } };
}

async function request(endpoint, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const config = {
    ...fetchOptions,
    headers: { 'Content-Type': 'application/json', ...fetchOptions.headers },
    signal: controller.signal,
  };
  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, config);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError('連線逾時，請確認網路後按「重試」。', { code: 'timeout' });
    }
    throw new ApiError('目前無法連線到 Toolbox，請確認服務與網路後重試。', { code: 'network_error' });
  } finally {
    window.clearTimeout(timeout);
  }
  const data = await readResponseData(response);
  if (!response.ok) {
    const retryAfter = payloadRetryAfter(data, response);
    if (response.status === 401) announceSessionExpired();
    throw new ApiError(responseMessage(data, response.status, retryAfter), {
      status: response.status,
      code: payloadCode(data, response.status),
      details: payloadDetail(data),
      retryAfter,
    });
  }
  return data?.__raw_response_text ? {} : data;
}

export const api = {
  getHealth: () => request('/health', { cache: 'no-store' }),
  getAuthConfig: () => request('/auth/config'),
  getAuthUrl: () => request('/auth/url'),
  getSheetsAuthUrl: () => request('/auth/sheets/url'),
  disconnectSheets: () => request('/auth/sheets/disconnect', { method: 'POST' }),
  getDriveAuthUrl: () => request('/auth/drive/url'),
  disconnectDrive: () => request('/auth/drive/disconnect', { method: 'POST' }),
  getYoutubeAuthUrl: (slot = 'primary') => request(`/auth/youtube/${encodeURIComponent(slot)}/url`),
  disconnectYoutube: (slot = 'primary', { confirm = false } = {}) => request(`/auth/youtube/${encodeURIComponent(slot)}/disconnect${confirm ? '?confirm=true' : ''}`, { method: 'POST' }),
  activateYoutubeSlot: (slot) => request(`/auth/youtube/${encodeURIComponent(slot)}/activate`, { method: 'POST' }),
  getUserStatus: async () => hideUnavailableSecondarySlot(await request('/auth/user', { cache: 'no-store' })),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getSystemInfo: () => request('/settings/system'),
  getSharedSettings: () => request('/settings/shared'),
  updateSharedSettings: (payload) => request('/settings/shared', { method: 'PUT', body: JSON.stringify(payload) }),
  getYoutubeSettings: () => request('/settings/youtube'),
  updateYoutubePlaylist: ({ playlistId, defaultPlaylistId } = {}) => request('/settings/youtube/playlist', {
    method: 'PUT',
    body: JSON.stringify(normalizeYoutubeSettingsPayload({ default_playlist_id: defaultPlaylistId ?? playlistId ?? '' })),
  }),
  updateYoutubeRoutingMode: (routingMode) => request('/settings/youtube/routing', {
    method: 'PUT',
    body: JSON.stringify({ routing_mode: routingMode }),
  }),
  updateYoutubeQuota: ({ slot = 'primary', quotaLimit, safetyBufferUnits, quotaBuffer } = {}) => request('/settings/youtube/quota', {
    method: 'PUT',
    body: JSON.stringify({ slot, quota_limit: quotaLimit, safety_buffer_units: safetyBufferUnits ?? quotaBuffer }),
  }),
  getYoutubeSlotSettings: () => request('/settings/youtube-slots'),
  getTeamPersonFilter: () => request('/settings/team-person-filter'),
  updateTeamPersonFilter: ({ team = '', selectedPeople = [] }) => request('/settings/team-person-filter', {
    method: 'PUT',
    body: JSON.stringify({ team, selected_people: selectedPeople }),
  }),
  getYoutubeDraftSettings: () => request('/settings/youtube-drafts'),
  updateYoutubeDraftSettings: (videoType, config) => request('/settings/youtube-drafts', { method: 'PUT', body: JSON.stringify({ video_type: videoType, config }) }),
  getWorkState: () => request('/settings/work-state'),
  updateWorkState: (key, value) => request('/settings/work-state', { method: 'PUT', body: JSON.stringify({ key, value }) }),
  getSpreadsheetMetadata: (spreadsheetUrlOrId) => request('/sheets/metadata', { method: 'POST', body: JSON.stringify({ spreadsheet_url_or_id: spreadsheetUrlOrId }) }),
  parseSheetOptions: (spreadsheetUrlOrId, worksheetName) => request('/sheets/parse-options', { method: 'POST', body: JSON.stringify({ spreadsheet_url_or_id: spreadsheetUrlOrId, worksheet_name: worksheetName }) }),
  getTeamPeople: (spreadsheetUrlOrId, worksheetName, team) => request('/sheets/people', { method: 'POST', body: JSON.stringify({ spreadsheet_url_or_id: spreadsheetUrlOrId, worksheet_name: worksheetName, team }) }),
  getRandomMemberPreview: (spreadsheetUrlOrId, worksheetName, team, columns) => request('/sheets/random-member-preview', { method: 'POST', body: JSON.stringify({ spreadsheet_url_or_id: spreadsheetUrlOrId, worksheet_name: worksheetName, team, columns }) }),
  getCopyableSheetTable: (spreadsheetUrlOrId, worksheetName) => request('/sheets/copy-table', { method: 'POST', body: JSON.stringify({ spreadsheet_url_or_id: spreadsheetUrlOrId, worksheet_name: worksheetName }) }),
  getYoutubeQuotaUsage: (slot) => request(`/youtube/quota-usage${slot ? `?slot=${encodeURIComponent(slot)}` : ''}`),
  estimateYoutubeQuota: ({ operation, itemCount, slot }) => request('/youtube/quota-estimate', { method: 'POST', body: JSON.stringify({ operation, item_count: itemCount, ...(slot ? { slot } : {}) }) }),
  getPlaylistVideos: (playlistId) => request('/youtube/playlist-items', { method: 'POST', body: JSON.stringify({ playlist_id: normalizedYoutubePlaylistOrOriginal(playlistId) }) }),
  getBatchPreview: ({ spreadsheetUrlOrId, playlistId, videoType, worksheetName, titleColumn, descriptionColumn, team, assignments }) => request('/youtube/batch-preview', { method: 'POST', timeoutMs: YOUTUBE_WORKFLOW_TIMEOUT_MS, body: JSON.stringify({ spreadsheet_url_or_id: spreadsheetUrlOrId, playlist_id: normalizedYoutubePlaylistOrOriginal(playlistId), video_type: videoType, worksheet_name: worksheetName, title_column: titleColumn, description_column: descriptionColumn, team, assignments }) }),
  updateYoutubeVideoMetadata: ({ videoId, title, description }) => request('/youtube/video-metadata', { method: 'POST', body: JSON.stringify({ video_id: videoId, title, description }) }),
  batchUpdateMetadata: ({ spreadsheetUrlOrId, playlistId, youtubeSlot, videoType, worksheetName, titleColumn, descriptionColumn, team, assignments, previewToken, previewSnapshot }) => request('/youtube/batch-update', { method: 'POST', timeoutMs: YOUTUBE_WORKFLOW_TIMEOUT_MS, body: JSON.stringify({ spreadsheet_url_or_id: spreadsheetUrlOrId, playlist_id: normalizedYoutubePlaylistOrOriginal(playlistId), ...(youtubeSlot ? { youtube_slot: youtubeSlot } : {}), video_type: videoType, worksheet_name: worksheetName, title_column: titleColumn, description_column: descriptionColumn, team, assignments, ...(previewToken ? { preview_token: previewToken } : {}), ...(previewSnapshot ? { preview_snapshot: previewSnapshot } : {}) }) }),
  publishAndCleanup: (playlistId, { youtubeSlot, previewToken, previewSnapshot } = {}) => request('/youtube/publish-and-cleanup', { method: 'POST', timeoutMs: YOUTUBE_WORKFLOW_TIMEOUT_MS, body: JSON.stringify({ playlist_id: normalizedYoutubePlaylistOrOriginal(playlistId), ...(youtubeSlot ? { youtube_slot: youtubeSlot } : {}), ...(previewToken ? { preview_token: previewToken } : {}), ...(previewSnapshot ? { preview_snapshot: previewSnapshot } : {}) }) }),

  // System Setup, Credentials & Allowlist
  getSetupStatus: () => request('/system/setup-status', { cache: 'no-store' }),
  performSetup: ({ googleClientId, googleClientSecret, adminEmail, pin, publicBaseUrl } = {}) => request('/system/setup', {
    method: 'POST',
    body: JSON.stringify({
      google_client_id: googleClientId,
      google_client_secret: googleClientSecret,
      admin_email: adminEmail,
      pin: pin || '',
      public_base_url: publicBaseUrl || '',
    }),
  }),
  getSystemCredentials: () => request('/system/credentials', { cache: 'no-store' }),
  updateSystemCredentials: (payload) => request('/system/credentials', {
    method: 'PUT',
    body: JSON.stringify(payload),
  }),
  getAllowlist: () => request('/system/allowlist', { cache: 'no-store' }),
  addAllowlistEmail: (email) => request('/system/allowlist/add', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }),
  removeAllowlistEmail: (email) => request('/system/allowlist/remove', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }),
  updateAllowNewUsers: (allowNewUsers) => request('/system/allow-new-users', {
    method: 'PUT',
    body: JSON.stringify({ allow_new_users: Boolean(allowNewUsers) }),
  }),
  updateYoutubeSlotConfig: (slot, payload) => request(`/settings/youtube-slots/${encodeURIComponent(slot)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }),

  // Sticky Notes API
  getNotes: (query) => request(`/notes${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  createNote: ({ content = '', remark = '', pinned = false } = {}) => request('/notes', {
    method: 'POST',
    body: JSON.stringify({ content, remark, pinned }),
  }),
  getNote: (noteId) => request(`/notes/${encodeURIComponent(noteId)}`),
  updateNote: (noteId, { content, remark, pinned } = {}) => request(`/notes/${encodeURIComponent(noteId)}`, {
    method: 'PUT',
    body: JSON.stringify({ content, remark, pinned }),
  }),
  deleteNote: (noteId) => request(`/notes/${encodeURIComponent(noteId)}`, {
    method: 'DELETE',
  }),

  // Photo Curator API
  getPhotoCuratorPresets: () => request('/photo-curator/presets'),
  generatePhotoCuratorChecklist: ({ posts = [], notes = '' } = {}) => request('/photo-curator/checklist', {
    method: 'POST',
    body: JSON.stringify({ posts, notes }),
  }),
};
