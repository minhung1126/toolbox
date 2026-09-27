import { api } from '../../../services/api';
import type { WeverseUploadApi, WeverseUploadQueuedResponse } from './types';

export type * from './types';

export class WeverseUploadResultError extends Error {
  code = 'weverse_upload_result_invalid';
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
  getHistory: (limit) => api.getWeverseUploadHistory(limit),
  getTask: (taskId) => api.getWeverseUploadTask(taskId),
  scanFolder: (folderPath) => api.scanWeverseFolder(folderPath),
  parseFiles: (files) => api.parseWeverseFiles(files),
  uploadFromPath: async (payload) => parseQueuedUpload(await api.uploadWeverseFromPath(payload)),
  uploadFiles: async (formData) => parseQueuedUpload(await api.uploadWeverseFiles(formData)),
};
