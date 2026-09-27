import { api } from '../../../services/api';
import type { PlaylistPreviewResponse, PublishCleanupApi, PublishCleanupResult } from './publishCleanupTypes';

export type * from './publishCleanupTypes';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isOptionalText(value: unknown): boolean {
  return value == null || typeof value === 'string';
}

function previewSnapshot(response: Record<string, unknown>): unknown {
  const nested = isRecord(response.preview) ? response.preview.snapshot : null;
  return response.preview_snapshot ?? response.previewSnapshot ?? nested ?? response.snapshot;
}

function previewToken(response: Record<string, unknown>): unknown {
  const nested = isRecord(response.preview) ? response.preview.token : null;
  return response.preview_token ?? response.previewToken ?? response.snapshot_token ?? response.snapshotToken ?? nested;
}

function parsePlaylistPreview(value: unknown): PlaylistPreviewResponse {
  if (
    !isRecord(value) ||
    typeof value.playlist_id !== 'string' ||
    value.playlist_id.length === 0 ||
    !Array.isArray(value.videos) ||
    !value.videos.every(
      (video) =>
        isRecord(video) &&
        typeof video.video_id === 'string' &&
        video.video_id.length > 0 &&
        isOptionalText(video.title) &&
        isOptionalText(video.description) &&
        isOptionalText(video.published_at)
    ) ||
    (value.total != null && (!isCount(value.total) || value.total !== value.videos.length))
  ) {
    throw new Error('播放清單預覽回應格式不正確。');
  }

  const snapshot = previewSnapshot(value);
  const token = previewToken(value);
  if (!isRecord(snapshot) || typeof token !== 'string' || token.length === 0) {
    throw new Error('播放清單預覽缺少可驗證的快照。');
  }
  const videoIds = value.videos.map((video) => video.video_id);
  if (
    (snapshot.playlist_id != null && snapshot.playlist_id !== value.playlist_id) ||
    (snapshot.video_ids != null &&
      (!Array.isArray(snapshot.video_ids) ||
        snapshot.video_ids.length !== videoIds.length ||
        snapshot.video_ids.some((videoId, index) => videoId !== videoIds[index])))
  ) {
    throw new Error('播放清單預覽快照與影片清單不一致。');
  }
  return value as unknown as PlaylistPreviewResponse;
}

const RESULT_STATUSES = new Set(['succeeded', 'succeeded_with_warnings', 'skipped', 'failed', 'not_attempted']);

class PublishResultContractError extends Error {
  code = 'publish_result_invalid';
}

function parsePublishResult(value: unknown): PublishCleanupResult {
  if (
    !isRecord(value) ||
    value.operation !== 'youtube.publish_cleanup' ||
    typeof value.completed !== 'boolean' ||
    typeof value.quota_blocked !== 'boolean' ||
    !isCount(value.total_count) ||
    !isCount(value.succeeded_count) ||
    !isCount(value.warning_count) ||
    !isCount(value.skipped_count) ||
    !isCount(value.failed_count) ||
    !isCount(value.not_attempted_count) ||
    !Array.isArray(value.results) ||
    value.results.length !== value.total_count ||
    !value.results.every(
      (item) =>
        isRecord(item) &&
        typeof item.video_id === 'string' &&
        item.video_id.length > 0 &&
        RESULT_STATUSES.has(item.status as string) &&
        isOptionalText(item.title) &&
        isOptionalText(item.description) &&
        isOptionalText(item.reason)
    )
  ) {
    throw new PublishResultContractError('發布草稿結果回應格式不正確。');
  }
  const countTotal =
    value.succeeded_count + value.warning_count + value.skipped_count + value.failed_count + value.not_attempted_count;
  if (countTotal !== value.total_count) {
    throw new PublishResultContractError('發布草稿結果計數不一致。');
  }
  return value as unknown as PublishCleanupResult;
}

export const publishCleanupApi: PublishCleanupApi = {
  async getPlaylistVideos(playlistId) {
    const response: unknown = await api.getPlaylistVideos(playlistId);
    return parsePlaylistPreview(response);
  },
  estimateQuota: (request) => api.estimateYoutubeQuota(request),
  async publishAndCleanup(playlistId, options) {
    const response: unknown = await api.publishAndCleanup(playlistId, options);
    return parsePublishResult(response);
  },
  updateVideoMetadata: (request) => api.updateYoutubeVideoMetadata(request),
};
