import { api } from '../../../services/api';
import type { YoutubeDraftVideoType } from './youtubeBatchTypes';

export interface DraftSource {
  spreadsheet_url_or_id: string;
  playlist_id: string;
  video_type: YoutubeDraftVideoType;
  worksheet_name: string;
  title_column: string;
  description_column: string;
  team: string;
  assignments: { video_id: string; person: string }[];
}
export interface StagedVideo {
  video_id: string;
  person: string;
  person_key: string;
  currentTitle: string;
  currentDescription: string;
  currentPrivacy: string;
  newTitle: string;
  newDescription: string;
  status: 'ready' | 'skipped';
  reason: string;
  thumbnailUrl: string;
}
export interface DraftStage {
  stage_token: string;
  stage_snapshot: {
    version: 1;
    stage_id: string;
    video_type: YoutubeDraftVideoType;
    youtube_slot: string;
    youtube_channel_id: string;
    source: Record<string, unknown>;
    plan: StagedVideo[];
    [key: string]: unknown;
  };
}
export interface FinalEdit {
  video_id: string;
  title: string;
  description: string;
  skip: boolean;
}
export interface FinalPlanItem {
  video_id: string;
  title: string;
  description: string;
  person: string;
  status: 'ready' | 'skipped' | 'unchanged';
  parts: string[];
  reason: string;
  write_units: number;
}
export interface DraftPreview {
  preview_token: string;
  preview_snapshot: Record<string, unknown> & { youtube_slot: string };
  plan: FinalPlanItem[];
  quota: { write_calls: number; write_units: number; read_units: number; projected_units: number };
}
export interface DraftPublishRequest extends DraftStage {
  edits: FinalEdit[];
  request_id?: string;
  youtube_slot?: string;
  preview_token?: string;
  preview_snapshot?: DraftPreview['preview_snapshot'];
}
export interface DraftResultItem {
  video_id: string;
  title: string;
  description: string;
  person: string;
  status: 'succeeded' | 'skipped' | 'failed' | 'not_attempted' | 'needs_reconciliation';
  reason?: string;
}
export interface DraftResult {
  operation: 'youtube.metadata_publish';
  operation_id: string;
  completed: boolean;
  results: DraftResultItem[];
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function invalid(): never {
  throw new Error('伺服器結果格式不完整，請至作業紀錄核對後再繼續。');
}
export const draftPublishApi = {
  async prepare(source: DraftSource): Promise<DraftStage> {
    const value: unknown = await api.prepareYoutubeDrafts(source);
    if (!record(value) || typeof value.stage_token !== 'string' || !value.stage_token || !record(value.stage_snapshot))
      invalid();
    const snapshot = value.stage_snapshot;
    if (
      snapshot.version !== 1 ||
      snapshot.video_type !== source.video_type ||
      typeof snapshot.stage_id !== 'string' ||
      !snapshot.stage_id ||
      typeof snapshot.youtube_channel_id !== 'string' ||
      !snapshot.youtube_channel_id ||
      !Array.isArray(snapshot.plan)
    )
      invalid();
    if (
      snapshot.plan.length !== source.assignments.length ||
      !snapshot.plan.every(
        (item, index) =>
          record(item) &&
          item.video_id === source.assignments[index].video_id &&
          ['currentTitle', 'currentDescription', 'newTitle', 'newDescription', 'person'].every(
            (key) => typeof item[key] === 'string'
          ) &&
          ['ready', 'skipped'].includes(String(item.status))
      )
    )
      invalid();
    return value as unknown as DraftStage;
  },
  async preview(payload: DraftPublishRequest): Promise<DraftPreview> {
    const value: unknown = await api.previewYoutubeDrafts(payload);
    if (
      !record(value) ||
      typeof value.preview_token !== 'string' ||
      !value.preview_token ||
      !record(value.preview_snapshot) ||
      !Array.isArray(value.plan) ||
      !record(value.quota)
    )
      invalid();
    if (
      value.plan.length !== payload.edits.length ||
      !value.plan.every(
        (item, index) =>
          record(item) &&
          item.video_id === payload.edits[index].video_id &&
          item.title === payload.edits[index].title &&
          item.description === payload.edits[index].description &&
          Array.isArray(item.parts) &&
          ['ready', 'skipped', 'unchanged'].includes(String(item.status))
      )
    )
      invalid();
    if (
      JSON.stringify(value.preview_snapshot.plan) !== JSON.stringify(value.plan) ||
      !['write_calls', 'write_units', 'read_units', 'projected_units'].every(
        (key) =>
          Number.isInteger(value.quota && (value.quota as Record<string, unknown>)[key]) &&
          Number((value.quota as Record<string, unknown>)[key]) >= 0
      )
    )
      invalid();
    return value as unknown as DraftPreview;
  },
  async publish(payload: DraftPublishRequest): Promise<DraftResult> {
    const value: unknown = await api.publishYoutubeDrafts(payload);
    if (
      !record(value) ||
      value.operation !== 'youtube.metadata_publish' ||
      typeof value.operation_id !== 'string' ||
      typeof value.completed !== 'boolean' ||
      !Array.isArray(value.results) ||
      value.results.length !== payload.edits.length
    )
      invalid();
    if (
      !value.results.every(
        (item, index) =>
          record(item) &&
          item.video_id === payload.edits[index].video_id &&
          ['succeeded', 'skipped', 'failed', 'not_attempted', 'needs_reconciliation'].includes(String(item.status))
      )
    )
      invalid();
    if (
      value.completed &&
      value.results.some((item) => !['succeeded', 'skipped'].includes(String((item as Record<string, unknown>).status)))
    )
      invalid();
    return value as unknown as DraftResult;
  },
};
