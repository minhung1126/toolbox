import { api } from '../../../services/api';
import type {
  WeverseUploadApi,
  WeverseUploadHistoryResponse,
  WeverseUploadQueuedResponse,
  WeverseUploadTask,
  WeverseUploadTaskResponse,
} from './types';

export type * from './types';

export class WeverseUploadResultError extends Error {
  code = 'weverse_upload_result_invalid';
}

export class WeverseTaskContractError extends Error {
  code = 'weverse_task_invalid';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTask(value: unknown): value is WeverseUploadTask {
  if (!isRecord(value)) return false;
  if (
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
  getRecentPaths: () => api.getWeverseRecentPaths(),
  getHistory: async (limit) => parseHistoryResponse(await api.getWeverseUploadHistory(limit)),
  getTask: async (taskId) => parseTaskResponse(await api.getWeverseUploadTask(taskId), taskId),
  scanFolder: (folderPath) => api.scanWeverseFolder(folderPath),
  parseFiles: (files) => api.parseWeverseFiles(files),
  uploadFromPath: async (payload) => parseQueuedUpload(await api.uploadWeverseFromPath(payload)),
  uploadFiles: async (formData) => parseQueuedUpload(await api.uploadWeverseFiles(formData)),
};
