import { api } from '../../../services/api';
import type { CleanupItem, CleanupPreview, PublishCleanupApi, PublishCleanupResult } from './publishCleanupTypes';
export type * from './publishCleanupTypes';

const statuses = ['succeeded', 'skipped', 'failed', 'not_attempted', 'needs_reconciliation'] as const;
const privacies = ['public', 'private', 'unlisted', 'unknown'] as const;
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const count = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0;
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

function item(value: unknown): value is CleanupItem {
  return (
    record(value) &&
    text(value.video_id) &&
    text(value.playlist_id) &&
    text(value.playlist_item_id) &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    typeof value.reason === 'string' &&
    typeof value.observed_privacy === 'string' &&
    (privacies as readonly string[]).includes(value.observed_privacy) &&
    typeof value.candidate === 'boolean'
  );
}
function identity(value: CleanupItem) {
  return JSON.stringify([value.playlist_id, value.playlist_item_id, value.video_id]);
}
function unique(items: CleanupItem[]) {
  return new Set(items.map((row) => row.playlist_item_id)).size === items.length;
}
function fail(): never {
  const error = new Error('清理結果或預覽格式無法確認，請保留紀錄並核對。') as Error & { code: string };
  error.code = 'cleanup_contract_invalid';
  throw error;
}

export function parseCleanupPreview(value: unknown, playlistId: string): CleanupPreview {
  if (
    !record(value) ||
    value.version !== 2 ||
    value.mode !== 'cleanup_only' ||
    value.playlist_id !== playlistId ||
    !text(value.youtube_channel_id) ||
    !text(value.youtube_slot) ||
    !text(value.preview_token) ||
    !Array.isArray(value.items) ||
    !value.items.every(item) ||
    !unique(value.items) ||
    value.total_count !== value.items.length ||
    value.candidate_count !== value.items.filter((row: CleanupItem) => row.candidate).length ||
    !record(value.counts)
  )
    fail();
  const counts = value.counts;
  const items = value.items as CleanupItem[];
  if (
    !privacies.every(
      (privacy) =>
        count(counts[privacy]) &&
        counts[privacy] === items.filter((row: CleanupItem) => row.observed_privacy === privacy).length
    ) ||
    !items.every(
      (row: CleanupItem) => row.playlist_id === playlistId && (!row.candidate || row.observed_privacy === 'public')
    )
  )
    fail();
  const snapshot = value.preview_snapshot;
  if (
    !record(snapshot) ||
    snapshot.version !== 2 ||
    snapshot.mode !== 'cleanup_only' ||
    snapshot.playlist_id !== playlistId ||
    snapshot.youtube_channel_id !== value.youtube_channel_id ||
    snapshot.youtube_slot !== value.youtube_slot ||
    JSON.stringify(snapshot.items) !== JSON.stringify(value.items)
  )
    fail();
  return value as unknown as CleanupPreview;
}

type CleanupResultRow = CleanupItem & { status: (typeof statuses)[number] };

export function parseCleanupResult(value: unknown, expected: CleanupItem[]): PublishCleanupResult {
  if (
    !record(value) ||
    value.version !== 2 ||
    value.mode !== 'cleanup_only' ||
    value.operation !== 'youtube.publish_cleanup' ||
    typeof value.completed !== 'boolean' ||
    typeof value.quota_blocked !== 'boolean' ||
    !Array.isArray(value.results) ||
    value.total_count !== expected.length ||
    value.results.length !== expected.length ||
    !unique(value.results) ||
    !value.results.every((row: unknown, index: number): row is CleanupResultRow => {
      if (!item(row) || identity(row) !== identity(expected[index])) return false;
      const status = (row as unknown as Record<string, unknown>).status;
      return typeof status === 'string' && (statuses as readonly string[]).includes(status);
    })
  )
    fail();
  const rows = value.results as CleanupResultRow[];
  if (
    !statuses.every(
      (status) =>
        count(value[`${status}_count`]) &&
        value[`${status}_count`] === rows.filter((row) => row.status === status).length
    )
  )
    fail();
  if (value.completed !== !rows.some((row) => ['failed', 'not_attempted', 'needs_reconciliation'].includes(row.status)))
    fail();
  return value as unknown as PublishCleanupResult;
}

export const publishCleanupApi: PublishCleanupApi = {
  async previewCleanup(playlistId) {
    return parseCleanupPreview(await api.previewYoutubeCleanup(playlistId), playlistId);
  },
  estimateQuota: (request) => api.estimateYoutubeQuota(request),
  async cleanupPublicItems(playlistId, options) {
    const snapshot = options.previewSnapshot;
    if (!record(snapshot) || snapshot.version !== 2 || !Array.isArray(snapshot.items)) fail();
    return parseCleanupResult(await api.cleanupPublicItems(playlistId, options), snapshot.items as CleanupItem[]);
  },
};
