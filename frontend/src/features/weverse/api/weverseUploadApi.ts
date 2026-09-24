import { api } from '../../../services/api';
import type { WeverseUploadApi } from './types';

export type * from './types';

/** Keep the feature's endpoint names and wire contracts inside its API boundary. */
export const weverseUploadApi: WeverseUploadApi = {
  getUploaderAuthUrl: () => api.getVideoUploaderAuthUrl(),
  disconnectUploader: () => api.disconnectVideoUploader(),
  getRecentPaths: () => api.getWeverseRecentPaths(),
  getHistory: (limit) => api.getWeverseUploadHistory(limit),
  getTask: (taskId) => api.getWeverseUploadTask(taskId),
  scanFolder: (folderPath) => api.scanWeverseFolder(folderPath),
  parseFiles: (files) => api.parseWeverseFiles(files),
  uploadFromPath: (payload) => api.uploadWeverseFromPath(payload),
  uploadFiles: (formData) => api.uploadWeverseFiles(formData),
};
