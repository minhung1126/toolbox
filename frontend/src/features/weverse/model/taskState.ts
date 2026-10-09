import type { WeverseUploadTask } from '../api/types';
export type UploadView = 'pick' | 'review' | 'uploading' | 'completed';
export interface UploadToast {
  success(message: string): void;
  error(message: string): void;
  warning?(message: string): void;
}
export function uploadError(value: unknown): { message: string; code?: string; status?: number } {
  return typeof value === 'object' && value !== null
    ? (value as { message: string; code?: string; status?: number })
    : { message: '操作失敗' };
}
export function isActiveTask(task: WeverseUploadTask | null) {
  return !!task && ['pending', 'uploading_video', 'uploading_captions'].includes(task.status);
}
export function pendingCaptionCount(task: WeverseUploadTask) {
  return task.caption_results?.filter((item) => item.status !== 'uploaded').length ?? task.failed_captions?.length ?? 0;
}
export interface TaskState {
  task: WeverseUploadTask | null;
  error: string;
  loading: boolean;
}
export type TaskAction =
  { type: 'load' } | { type: 'task'; task: WeverseUploadTask } | { type: 'error'; message: string } | { type: 'clear' };
export function taskReducer(state: TaskState, action: TaskAction): TaskState {
  switch (action.type) {
    case 'load':
      return { ...state, loading: true, error: '' };
    case 'task':
      return { task: action.task, error: '', loading: false };
    case 'error':
      return { ...state, error: action.message, loading: false };
    case 'clear':
      return { task: null, error: '', loading: false };
  }
}
