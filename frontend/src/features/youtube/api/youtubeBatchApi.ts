import { api } from '../../../services/api';
import type {
  YoutubeBatchApi,
  YoutubeBatchPreviewResponse,
  YoutubeBatchUpdateResponse,
  YoutubeDraftConfig,
  YoutubeDraftSettingsResponse,
  YoutubeDraftSettingsUpdateResponse,
} from './youtubeBatchTypes';
import type { PlaylistPreviewResponse } from './publishCleanupTypes';
import { youtubeSettingsApi } from './youtubeSettingsApi';

export type * from './youtubeBatchTypes';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isOptionalText(value: unknown): boolean {
  return value == null || typeof value === 'string';
}

class DraftSettingsContractError extends Error {
  code = 'youtube_draft_settings_response_invalid';

  constructor() {
    super('草稿設定結果無法確認，請重新整理後核對。');
  }
}

const DRAFT_FIELDS = ['spreadsheet_id', 'playlist_id', 'worksheet_name', 'title_column', 'description_column'] as const;

function isDraftConfig(value: unknown): value is Record<(typeof DRAFT_FIELDS)[number], string> {
  return isRecord(value) && DRAFT_FIELDS.every((field) => typeof value[field] === 'string');
}

function isPartialDraftConfig(value: unknown): boolean {
  return isRecord(value) && DRAFT_FIELDS.every((field) => value[field] === undefined || typeof value[field] === 'string');
}

function parseDraftSettings(value: unknown): YoutubeDraftSettingsResponse {
  if (!isRecord(value) || !isPartialDraftConfig(value.video) || !isPartialDraftConfig(value.shorts)) {
    throw new DraftSettingsContractError();
  }
  return value as YoutubeDraftSettingsResponse;
}

function parseDraftUpdate(
  value: unknown,
  videoType: string,
  config: YoutubeDraftConfig
): YoutubeDraftSettingsUpdateResponse {
  if (!isRecord(value) || value.status !== 'success' || value.video_type !== videoType || !isDraftConfig(value.config)) {
    throw new DraftSettingsContractError();
  }
  const savedConfig = value.config;
  if (DRAFT_FIELDS.some((field) => field !== 'playlist_id' && savedConfig[field] !== config[field])) {
    throw new DraftSettingsContractError();
  }
  return value as unknown as YoutubeDraftSettingsUpdateResponse;
}

function planVideoId(item: Record<string, unknown>): unknown {
  return item.video_id ?? item.videoId;
}

function parsePlaylistVideos(value: unknown): PlaylistPreviewResponse {
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
        isOptionalText(video.description)
    ) ||
    (value.total != null && (!isCount(value.total) || value.total !== value.videos.length))
  ) {
    throw new Error('草稿播放清單回應格式不正確。');
  }
  return value as unknown as PlaylistPreviewResponse;
}

function parseBatchPreview(value: unknown): YoutubeBatchPreviewResponse {
  if (
    !isRecord(value) ||
    typeof value.preview_token !== 'string' ||
    value.preview_token.length === 0 ||
    !isRecord(value.preview_snapshot) ||
    !Array.isArray(value.plan) ||
    !value.plan.every(
      (item) =>
        isRecord(item) &&
        typeof planVideoId(item) === 'string' &&
        (planVideoId(item) as string).length > 0 &&
        typeof item.person === 'string' &&
        typeof item.currentTitle === 'string' &&
        typeof item.currentDescription === 'string' &&
        typeof item.newTitle === 'string' &&
        typeof item.newDescription === 'string' &&
        (item.status === 'ready' || item.status === 'skipped') &&
        typeof item.willUpdate === 'boolean' &&
        isOptionalText(item.reason)
    )
  ) {
    throw new Error('批次更新預覽回應格式不正確。');
  }
  const planIds = value.plan.map((item) => planVideoId(item));
  const snapshot = value.preview_snapshot;
  if (
    (snapshot.video_ids != null &&
      (!Array.isArray(snapshot.video_ids) ||
        snapshot.video_ids.length !== planIds.length ||
        snapshot.video_ids.some((videoId, index) => videoId !== planIds[index]))) ||
    (snapshot.plan != null && JSON.stringify(snapshot.plan) !== JSON.stringify(value.plan))
  ) {
    throw new Error('批次更新預覽快照與計劃不一致。');
  }
  return value as unknown as YoutubeBatchPreviewResponse;
}

const RESULT_STATUSES = new Set(['succeeded', 'succeeded_with_warnings', 'skipped', 'failed', 'not_attempted']);

class BatchResultContractError extends Error {
  code = 'batch_result_invalid';
}

function parseBatchResult(value: unknown): YoutubeBatchUpdateResponse {
  if (
    !isRecord(value) ||
    value.operation !== 'youtube.metadata_update' ||
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
    throw new BatchResultContractError('批次更新結果回應格式不正確。');
  }
  const countTotal =
    value.succeeded_count + value.warning_count + value.skipped_count + value.failed_count + value.not_attempted_count;
  if (countTotal !== value.total_count) throw new BatchResultContractError('批次更新結果計數不一致。');
  return value as unknown as YoutubeBatchUpdateResponse;
}

const client: YoutubeBatchApi = {
  async getDraftSettings() {
    return parseDraftSettings(await api.getYoutubeDraftSettings());
  },
  async updateDraftSettings(videoType, config) {
    return parseDraftUpdate(await api.updateYoutubeDraftSettings(videoType, config), videoType, config);
  },
  updatePlaylist: (request) => youtubeSettingsApi.updatePlaylist(request),
  getRandomMemberPreview: (spreadsheetUrlOrId, worksheetName, team, columns) =>
    api.getRandomMemberPreview(spreadsheetUrlOrId, worksheetName, team, columns),
  getSpreadsheetMetadata: (spreadsheetUrlOrId) => api.getSpreadsheetMetadata(spreadsheetUrlOrId),
  async getPlaylistVideos(playlistId) {
    const response: unknown = await api.getPlaylistVideos(playlistId);
    return parsePlaylistVideos(response);
  },
  async getBatchPreview(request) {
    const response: unknown = await api.getBatchPreview(request);
    return parseBatchPreview(response);
  },
  async updateMetadata(request) {
    const response: unknown = await api.batchUpdateMetadata(request);
    return parseBatchResult(response);
  },
  estimateQuota: (request) => api.estimateYoutubeQuota(request),
};

export const youtubeBatchApi: Readonly<YoutubeBatchApi> = Object.freeze(client);

export { normalizeYoutubePlaylistInput } from '../model/playlistInput';
