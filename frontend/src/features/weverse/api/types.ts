export type WeversePrivacyStatus = 'private' | 'unlisted' | 'public';

export interface WeverseSubtitleConfig {
  full_path?: string;
  filename: string;
  raw_lang?: string;
  bcp47?: string;
  label?: string;
  enabled?: boolean;
}

export interface WeverseFileMetadata {
  name: string;
  size: number;
  relative_path: string;
}

export interface WeverseVideoFile {
  filename: string;
  full_path?: string;
  relative_path?: string;
  size_bytes: number;
  size_formatted: string;
  extension: string;
}

export interface WeverseSubtitleFile {
  filename: string;
  full_path?: string;
  relative_path?: string;
  size_bytes: number;
  size_formatted: string;
  raw_lang: string;
  bcp47: string;
  label: string;
  enabled: boolean;
}

export interface WeverseUploadPackage {
  package_id: string;
  folder_path?: string;
  folder_name: string;
  video: WeverseVideoFile | null;
  other_videos: WeverseVideoFile[];
  subtitles: WeverseSubtitleFile[];
  suggested_title: string;
  suggested_description: string;
}

export interface WeversePackageListResponse {
  status: 'success';
  packages_count: number;
  packages: WeverseUploadPackage[];
}

export interface WeverseScanResponse extends WeversePackageListResponse {
  scanned_path: string;
}

export interface WeverseRecentPathsResponse {
  status: 'success';
  paths: string[];
}

export interface CaptionResult {
  filename: string;
  language: string;
  name: string;
  status: 'pending' | 'uploaded' | 'unknown' | 'missing_file';
  caption_id?: string;
  error?: string;
  reconciled?: boolean;
}

export interface WeverseUploadTask {
  task_id: string;
  title: string;
  video_filename?: string;
  video_path?: string;
  privacy_status?: WeversePrivacyStatus;
  status: 'pending' | 'uploading_video' | 'uploading_captions' | 'completed' | 'failed' | 'interrupted';
  progress_percent: number;
  current_step: string;
  error_message?: string;
  video_id?: string;
  video_url?: string;
  studio_url?: string;
  subtitles_count?: number;
  caption_results?: CaptionResult[];
  failed_captions?: Array<{ language: string; name?: string; error?: string }>;
  uploaded_captions?: Array<{ language: string; caption_id?: string }>;
  updated_at?: string;
  created_at?: string;
  parent_task_id?: string;
  retry_task_id?: string;
}

export interface WeverseUploadTaskResponse {
  status: 'success';
  task: WeverseUploadTask;
}

export interface WeverseUploadHistoryResponse {
  status: 'success';
  tasks: WeverseUploadTask[];
}

export interface WeverseUploadQueuedResponse {
  status: 'queued';
  task_id: string;
}

export interface WeverseUploaderAuthUrlResponse {
  auth_url: string;
}

export interface WeverseUploaderDisconnectResponse {
  status: 'video_uploader_disconnected';
}

export interface WeverseUploadFromPathRequest {
  video_path: string;
  title: string;
  description?: string;
  privacy_status?: WeversePrivacyStatus;
  tags?: string[];
  category_id?: string;
  default_language?: string;
  subtitles?: WeverseSubtitleConfig[];
}

export interface WeverseUploadApi {
  getUploaderAuthUrl(): Promise<WeverseUploaderAuthUrlResponse>;
  disconnectUploader(): Promise<WeverseUploaderDisconnectResponse>;
  getRecentPaths(): Promise<WeverseRecentPathsResponse>;
  getHistory(limit?: number): Promise<WeverseUploadHistoryResponse>;
  getTask(taskId: string): Promise<WeverseUploadTaskResponse>;
  scanFolder(folderPath: string): Promise<WeverseScanResponse>;
  parseFiles(files: WeverseFileMetadata[]): Promise<WeversePackageListResponse>;
  uploadFromPath(payload: WeverseUploadFromPathRequest): Promise<WeverseUploadQueuedResponse>;
  retryCaptions(taskId: string, formData: FormData): Promise<WeverseUploadQueuedResponse>;
  uploadFiles(formData: FormData): Promise<WeverseUploadQueuedResponse>;
}
