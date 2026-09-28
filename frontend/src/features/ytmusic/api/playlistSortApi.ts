import { api } from '../../../services/api';
import type {
  PlaylistListResponse,
  PlaylistSortApi,
  PlaylistSortApplyRequest,
  PlaylistSortApplyResponse,
  PlaylistSortPreviewRequest,
  PlaylistSortPreviewResponse,
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0;
}

function isOptionalText(value: unknown): boolean {
  return value == null || typeof value === 'string';
}

function isOptionalNumberOrText(value: unknown): boolean {
  return value == null || typeof value === 'string' || typeof value === 'number';
}

function parsePlaylistList(value: unknown): PlaylistListResponse {
  if (
    !isRecord(value) ||
    !Array.isArray(value.playlists) ||
    !value.playlists.every(
      (playlist) =>
        isRecord(playlist) &&
        typeof playlist.id === 'string' &&
        playlist.id.length > 0 &&
        typeof playlist.title === 'string' &&
        isCount(playlist.item_count) &&
        isOptionalText(playlist.description) &&
        isOptionalText(playlist.privacy_status)
    )
  ) {
    throw new Error('播放清單回應格式不正確。');
  }
  return value as unknown as PlaylistListResponse;
}

function parseSortPreview(value: unknown): PlaylistSortPreviewResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.preview) ||
    typeof value.preview_token !== 'string' ||
    value.preview_token.length === 0
  ) {
    throw new Error('排序預覽回應格式不正確。');
  }
  const preview = value.preview;
  if (
    !isCount(preview.total) ||
    !isCount(preview.moved_count) ||
    !isCount(preview.unchanged_count) ||
    !Array.isArray(preview.items) ||
    preview.items.length !== preview.total ||
    !preview.items.every(
      (item) =>
        isRecord(item) &&
        typeof item.playlist_item_id === 'string' &&
        item.playlist_item_id.length > 0 &&
        isCount(item.original_position) &&
        isCount(item.new_position) &&
        (item.status === 'moved' || item.status === 'unchanged') &&
        isOptionalText(item.title) &&
        isOptionalText(item.artist) &&
        isOptionalText(item.channel_title) &&
        isOptionalText(item.album) &&
        isOptionalText(item.thumbnail_url) &&
        isOptionalText(item.release_date) &&
        isOptionalText(item.published_at) &&
        isOptionalText(item.added_at) &&
        isOptionalNumberOrText(item.track_number) &&
        isOptionalNumberOrText(item.year) &&
        (item.duration_seconds == null || isCount(item.duration_seconds))
    )
  ) {
    throw new Error('排序預覽曲目回應格式不正確。');
  }
  if (
    !isRecord(value.quota_estimate) ||
    !isCount(value.quota_estimate.total_units) ||
    !isCount(value.quota_estimate.moved_count) ||
    !isCount(value.quota_estimate.units_per_move)
  ) {
    throw new Error('排序預覽配額回應格式不正確。');
  }
  return value as unknown as PlaylistSortPreviewResponse;
}

function parseSortApply(value: unknown): PlaylistSortApplyResponse {
  if (
    !isRecord(value) ||
    (value.mode !== 'in_place' && value.mode !== 'new_playlist') ||
    !isCount(value.total) ||
    !isCount(value.moved) ||
    !isCount(value.succeeded) ||
    !isCount(value.failed) ||
    !isCount(value.quota_used) ||
    value.moved > value.total ||
    value.succeeded + value.failed !== value.moved ||
    !Array.isArray(value.failed_items) ||
    value.failed_items.length !== value.failed ||
    !value.failed_items.every(
      (item) =>
        isRecord(item) &&
        (typeof item.playlist_item_id === 'string' || typeof item.video_id === 'string') &&
        typeof item.error === 'string' &&
        item.error.length > 0
    ) ||
    (value.mode === 'new_playlist' &&
      (value.moved !== value.total ||
        typeof value.new_playlist_url !== 'string' ||
        !value.new_playlist_url.startsWith('https://'))) ||
    (value.new_playlist_url != null && typeof value.new_playlist_url !== 'string')
  ) {
    throw new Error('排序套用回應格式不正確。');
  }
  return value as unknown as PlaylistSortApplyResponse;
}

export const playlistSortApi: PlaylistSortApi = {
  async list({ language, location }) {
    const response: unknown = await api.getPlaylistSortPlaylists({ language, location });
    return parsePlaylistList(response);
  },
  async preview(request: PlaylistSortPreviewRequest) {
    const response: unknown = await api.previewPlaylistSort(request);
    return parseSortPreview(response);
  },
  async apply(request: PlaylistSortApplyRequest) {
    const response: unknown = await api.applyPlaylistSort(request);
    return parseSortApply(response);
  },
};
