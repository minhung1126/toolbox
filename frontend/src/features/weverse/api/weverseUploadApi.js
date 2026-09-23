import { api } from '../../../services/api';

/** Weverse's API boundary; endpoint names stay centralized in the shared client during migration. */
export const weverseUploadApi = Object.freeze({
  getRecentPaths: (...args) => api.getWeverseRecentPaths(...args),
  getHistory: (...args) => api.getWeverseUploadHistory(...args),
  getTask: (...args) => api.getWeverseUploadTask(...args),
  scanFolder: (...args) => api.scanWeverseFolder(...args),
  parseFiles: (...args) => api.parseWeverseFiles(...args),
  uploadFromPath: (...args) => api.uploadWeverseFromPath(...args),
  uploadFiles: (...args) => api.uploadWeverseFiles(...args),
});
