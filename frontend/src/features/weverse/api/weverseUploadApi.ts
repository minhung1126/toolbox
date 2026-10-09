import { api } from '../../../services/api';
import type {
  WeverseUploadApi,
  WeverseUploadHistoryResponse,
  WeverseUploadQueuedResponse,
  WeverseUploadTask,
  WeverseUploadTaskResponse,
  WeversePackageListResponse,
  WeverseRecentPathsResponse,
  WeverseScanResponse,
} from './types';

export type * from './types';

export class WeverseUploadResultError extends Error {
  code = 'weverse_upload_result_invalid';
}

export class WeverseTaskContractError extends Error {
  code = 'weverse_task_invalid';
}

export class WeversePackageContractError extends Error {
  code = 'weverse_package_invalid';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonnegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isVideoFile(value: unknown, source: 'path' | 'browser'): boolean {
  return (
    isRecord(value) &&
    typeof value.filename === 'string' &&
    value.filename.length > 0 &&
    isNonnegativeInteger(value.size_bytes) &&
    typeof value.size_formatted === 'string' &&
    typeof value.extension === 'string' &&
    (source === 'path'
      ? typeof value.full_path === 'string' && value.full_path.length > 0
      : typeof value.relative_path === 'string' && value.relative_path.length > 0)
  );
}

function isSubtitleFile(value: unknown, source: 'path' | 'browser'): boolean {
  return (
    isRecord(value) &&
    typeof value.filename === 'string' &&
    value.filename.length > 0 &&
    isNonnegativeInteger(value.size_bytes) &&
    typeof value.size_formatted === 'string' &&
    typeof value.raw_lang === 'string' &&
    typeof value.bcp47 === 'string' &&
    typeof value.label === 'string' &&
    typeof value.enabled === 'boolean' &&
    (source === 'path'
      ? typeof value.full_path === 'string' && value.full_path.length > 0
      : typeof value.relative_path === 'string' && value.relative_path.length > 0)
  );
}

function isPackage(value: unknown, source: 'path' | 'browser'): boolean {
  return (
    isRecord(value) &&
    typeof value.package_id === 'string' &&
    value.package_id.length > 0 &&
    typeof value.folder_name === 'string' &&
    typeof value.suggested_title === 'string' &&
    typeof value.suggested_description === 'string' &&
    (value.folder_path == null || typeof value.folder_path === 'string') &&
    (value.video === null || isVideoFile(value.video, source)) &&
    Array.isArray(value.other_videos) &&
    value.other_videos.every((video) => isVideoFile(video, source)) &&
    Array.isArray(value.subtitles) &&
    value.subtitles.every((subtitle) => isSubtitleFile(subtitle, source))
  );
}

function parsePackages(value: unknown, source: 'path' | 'browser'): WeversePackageListResponse {
  if (
    !isRecord(value) ||
    value.status !== 'success' ||
    !isNonnegativeInteger(value.packages_count) ||
    !Array.isArray(value.packages) ||
    value.packages_count !== value.packages.length ||
    !value.packages.every((pkg) => isPackage(pkg, source))
  ) {
    throw new WeversePackageContractError('Weverse 檔案辨識回應格式不正確。');
  }
  return value as unknown as WeversePackageListResponse;
}

function parseScan(value: unknown): WeverseScanResponse {
  parsePackages(value, 'path');
  if (!isRecord(value) || typeof value.scanned_path !== 'string' || value.scanned_path.length === 0) {
    throw new WeversePackageContractError('Weverse 掃描路徑回應格式不正確。');
  }
  return value as unknown as WeverseScanResponse;
}

function parseRecentPaths(value: unknown): WeverseRecentPathsResponse {
  if (
    !isRecord(value) ||
    value.status !== 'success' ||
    !Array.isArray(value.paths) ||
    !value.paths.every((path) => typeof path === 'string' && path.length > 0)
  ) {
    throw new WeversePackageContractError('Weverse 最近路徑回應格式不正確。');
  }
  return value as unknown as WeverseRecentPathsResponse;
}

function isTask(value: unknown): value is WeverseUploadTask {
  if (!isRecord(value)) return false;
  if (
    (value.caption_results != null &&
      (!Array.isArray(value.caption_results) ||
        !value.caption_results.every(
          (item) =>
            isRecord(item) &&
            typeof item.filename === 'string' &&
            typeof item.language === 'string' &&
            typeof item.name === 'string' &&
            ['pending', 'uploaded', 'unknown', 'missing_file'].includes(String(item.status)) &&
            (item.status !== 'uploaded' || (typeof item.caption_id === 'string' && item.caption_id.length > 0)) &&
            (item.error == null || typeof item.error === 'string')
        ))) ||
    (value.failed_captions != null &&
      (!Array.isArray(value.failed_captions) ||
        !value.failed_captions.every(
          (item) =>
            isRecord(item) &&
            typeof item.language === 'string' &&
            (item.error == null || typeof item.error === 'string')
        ))) ||
    (value.retry_task_id != null && typeof value.retry_task_id !== 'string') ||
    (value.parent_task_id != null && typeof value.parent_task_id !== 'string') ||
    (value.video_id != null && typeof value.video_id !== 'string') ||
    (value.updated_at != null && typeof value.updated_at !== 'string') ||
    typeof value.task_id !== 'string' ||
    value.task_id.trim().length === 0 ||
    typeof value.title !== 'string' ||
    typeof value.status !== 'string' ||
    !['pending', 'uploading_video', 'uploading_captions', 'completed', 'failed', 'interrupted'].includes(
      value.status
    ) ||
    typeof value.progress_percent !== 'number' ||
    !Number.isFinite(value.progress_percent) ||
    value.progress_percent < 0 ||
    value.progress_percent > 100 ||
    typeof value.current_step !== 'string' ||
    (value.video_url != null && typeof value.video_url !== 'string')
  ) {
    return false;
  }
  return (
    value.status !== 'completed' ||
    (typeof value.video_id === 'string' &&
      value.video_id.trim().length > 0 &&
      typeof value.video_url === 'string' &&
      value.video_url.length > 0)
  );
}

function parseTaskResponse(value: unknown, taskId: string): WeverseUploadTaskResponse {
  if (!isRecord(value) || value.status !== 'success' || !isTask(value.task) || value.task.task_id !== taskId) {
    throw new WeverseTaskContractError('Weverse 上傳任務回應格式不正確。');
  }
  return value as unknown as WeverseUploadTaskResponse;
}

function parseHistoryResponse(value: unknown): WeverseUploadHistoryResponse {
  if (!isRecord(value) || value.status !== 'success' || !Array.isArray(value.tasks) || !value.tasks.every(isTask)) {
    throw new WeverseTaskContractError('Weverse 上傳歷史回應格式不正確。');
  }
  return value as unknown as WeverseUploadHistoryResponse;
}

function parseQueuedUpload(value: unknown): WeverseUploadQueuedResponse {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('status' in value) ||
    value.status !== 'queued' ||
    !('task_id' in value) ||
    typeof value.task_id !== 'string' ||
    value.task_id.trim().length === 0
  ) {
    throw new WeverseUploadResultError('Weverse 上傳啟動回應格式不正確。');
  }
  return value as WeverseUploadQueuedResponse;
}

/** Keep the feature's endpoint names and wire contracts inside its API boundary. */
export const weverseUploadApi: WeverseUploadApi = {
  getUploaderAuthUrl: () => api.getVideoUploaderAuthUrl(),
  disconnectUploader: () => api.disconnectVideoUploader(),
  getRecentPaths: async () => parseRecentPaths(await api.getWeverseRecentPaths()),
  getHistory: async (limit) => parseHistoryResponse(await api.getWeverseUploadHistory(limit)),
  retryCaptions: async (taskId, formData) => parseQueuedUpload(await api.retryWeverseCaptions(taskId, formData)),
  getTask: async (taskId) => parseTaskResponse(await api.getWeverseUploadTask(taskId), taskId),
  scanFolder: async (folderPath) => parseScan(await api.scanWeverseFolder(folderPath)),
  parseFiles: async (files) => parsePackages(await api.parseWeverseFiles(files), 'browser'),
  uploadFromPath: async (payload) => parseQueuedUpload(await api.uploadWeverseFromPath(payload)),
  uploadFiles: async (formData) => parseQueuedUpload(await api.uploadWeverseFiles(formData)),
};
