export interface YoutubeSlotState {
  configured?: boolean;
  authenticated?: boolean;
  channel_id?: string;
  channel_title?: string;
  client_fingerprint?: string;
  token_status?: string;
  token_expires_at?: string;
  last_refreshed_at?: string;
  user?: { sub?: string; email?: string };
}

export interface YoutubeRoutingState {
  routing_mode?: string;
  active_slot?: string;
  slots?: Record<string, YoutubeSlotState | undefined>;
}

export interface YoutubeAuthUser {
  youtube?: YoutubeRoutingState;
}

export const YOUTUBE_ROUTING_MODES = {
  AUTO_PRIMARY: 'auto_primary',
  MANUAL: 'manual',
} as const;

export function youtubeRoutingMode(youtube?: YoutubeRoutingState | null) {
  return youtube?.routing_mode === YOUTUBE_ROUTING_MODES.MANUAL
    ? YOUTUBE_ROUTING_MODES.MANUAL
    : YOUTUBE_ROUTING_MODES.AUTO_PRIMARY;
}

export function youtubePreferredUiSlot(youtube?: YoutubeRoutingState | null) {
  const slots = youtube?.slots || {};
  const activeSlot = youtube?.active_slot || 'primary';
  if (youtubeRoutingMode(youtube) === YOUTUBE_ROUTING_MODES.MANUAL) return activeSlot;
  if (slots.primary?.authenticated) return 'primary';
  if (slots.secondary?.authenticated) return 'secondary';
  return activeSlot;
}

export function youtubeIsConnected(youtube?: YoutubeRoutingState | null) {
  const slots = youtube?.slots || {};
  if (youtubeRoutingMode(youtube) === YOUTUBE_ROUTING_MODES.MANUAL) {
    return Boolean(slots[youtube?.active_slot || 'primary']?.authenticated);
  }
  return Object.values(slots).some((slot) => slot?.authenticated);
}

export function youtubeRoutingLabel(mode?: string | null) {
  return mode === YOUTUBE_ROUTING_MODES.MANUAL ? '手動指定' : 'Auto：Primary 優先';
}

export function youtubeRoutingReasonLabel(reason?: string | null) {
  const labels: Record<string, string> = {
    auto_primary_available: 'Primary 配額足夠，優先使用 Primary',
    auto_secondary_quota_fallback: 'Primary 執行途中配額不足，改用 Secondary 繼續',
    auto_secondary_quota_insufficient: 'Primary 本次配額不足，改用 Secondary',
    auto_secondary_youtube_quota_exhausted: 'Primary 配額已用完，改用 Secondary',
    auto_secondary_youtube_quota_safety_blocked: 'Primary 已達安全上限，改用 Secondary',
    auto_secondary_youtube_quota_storage_unavailable: 'Primary 配額記錄暫時不可用，改用 Secondary',
    auto_primary_quota_insufficient: 'Secondary 本次配額不足，改回 Primary',
    auto_primary_youtube_quota_exhausted: 'Secondary 配額已用完，改回 Primary',
    auto_primary_youtube_quota_safety_blocked: 'Secondary 已達安全上限，改回 Primary',
    auto_primary_youtube_quota_storage_unavailable: 'Secondary 配額記錄暫時不可用，改回 Primary',
    auto_primary_quota_fallback: 'Secondary 執行途中配額不足，改回 Primary 繼續',
    auto_secondary_not_connected: 'Primary 未連結，改用 Secondary',
    auto_secondary_not_configured: 'Primary 未配置，改用 Secondary',
    preview_pinned_slot: '沿用 preview 已選定的 slot',
    manual_active_slot: '手動使用目前作用中 slot',
  };
  return (reason && labels[reason]) || reason || '尚未取得 routing 原因';
}

export function getYoutubeAuthorizationFingerprint(
  youtube?: YoutubeRoutingState | null,
  activeSlotOverride: string | null = null
) {
  const slots = ['primary', 'secondary'].map((slot) => {
    const record = youtube?.slots?.[slot] || {};
    return [
      slot,
      record.configured,
      record.authenticated,
      record.channel_id,
      record.client_fingerprint,
      record.token_status,
      record.token_expires_at,
      record.last_refreshed_at,
    ];
  });
  return JSON.stringify({
    activeSlot: activeSlotOverride || youtube?.active_slot || 'primary',
    routingMode: youtubeRoutingMode(youtube),
    slots,
  });
}

export function getYoutubeAuthContext(authUser?: YoutubeAuthUser | null, slotOverride = '') {
  const youtube: YoutubeRoutingState = authUser?.youtube || {};
  const slot = slotOverride || youtubePreferredUiSlot(youtube);
  const record: YoutubeSlotState = youtube.slots?.[slot] || {};
  const user = record.user || {};
  return {
    slot,
    channelId: record.channel_id || '',
    channelTitle: record.channel_title || '',
    account: user.sub || user.email || '',
    clientFingerprint: record.client_fingerprint || '',
    authenticated: Boolean(record.authenticated) || youtubeIsConnected(youtube),
    tokenStatus: record.token_status || '',
    tokenExpiresAt: record.token_expires_at || '',
    lastRefreshedAt: record.last_refreshed_at || '',
    routingMode: youtubeRoutingMode(youtube),
    authorizationFingerprint: getYoutubeAuthorizationFingerprint(youtube),
  };
}
