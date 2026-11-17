import type { DraftPublishRequest, DraftResultItem } from './draftPublishApi';
export const progressStatuses = [
  'queued',
  'running',
  'succeeded',
  'unchanged',
  'skipped',
  'failed',
  'not_attempted',
  'needs_reconciliation',
] as const;
export type ProgressStatus = (typeof progressStatuses)[number];
export interface PublishProgress {
  version: 1;
  revision: number;
  total: number;
  counts: Record<ProgressStatus, number>;
  rows: Array<
    Omit<DraftResultItem, 'status'> & { status: ProgressStatus; attempted_parts: string[]; confirmation: string | null }
  >;
}
export interface PublishOperation {
  id: string;
  kind: 'youtube.metadata_publish';
  channel_id: string;
  state: string;
  plan: { stage_snapshot: { stage_id: string }; edits: DraftPublishRequest['edits'] };
  progress: PublishProgress;
  result?: unknown;
}
const record = (value: unknown): value is Record<string, any> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
function invalid(): never {
  throw new Error('作業進度格式或頻道不符，已保留待核對狀態與手動內容。');
}
export function parsePublishProgress(value: unknown, payload: DraftPublishRequest): PublishProgress {
  if (
    !record(value) ||
    value.version !== 1 ||
    !Number.isInteger(value.revision) ||
    value.revision < 1 ||
    value.total !== payload.edits.length ||
    !Array.isArray(value.rows) ||
    value.rows.length !== value.total ||
    !record(value.counts)
  )
    invalid();
  if (
    !value.rows.every(
      (row: unknown, index: number) =>
        record(row) &&
        row.video_id === payload.edits[index].video_id &&
        row.title === payload.edits[index].title &&
        row.description === payload.edits[index].description &&
        progressStatuses.includes(row.status) &&
        Array.isArray(row.attempted_parts) &&
        row.attempted_parts.every((part: unknown) => ['snippet', 'status'].includes(String(part))) &&
        (row.confirmation === null || typeof row.confirmation === 'string')
    )
  )
    invalid();
  if (
    !progressStatuses.every(
      (status) =>
        Number.isInteger(value.counts[status]) &&
        value.counts[status] >= 0 &&
        value.counts[status] === value.rows.filter((row: any) => row.status === status).length
    )
  )
    invalid();
  return value as PublishProgress;
}
function legacyProgress(value: Record<string, any>, payload: DraftPublishRequest): PublishProgress {
  const rows = payload.edits.map((edit) => {
    const result = value.result?.results?.find((row: any) => row.video_id === edit.video_id);
    if (result && (result.title !== edit.title || result.description !== edit.description)) invalid();
    const attempts = (value.items || []).filter((item: any) => item.remote_id === edit.video_id);
    const status =
      result?.status ||
      (edit.skip ? 'skipped' : value.state === 'failed_before_write' ? 'not_attempted' : 'needs_reconciliation');
    return {
      ...edit,
      person: '',
      status,
      attempted_parts: attempts.at(-1)?.intended?.parts || [],
      confirmation: status === 'succeeded' ? 'legacy_evidence' : null,
    };
  });
  return {
    version: 1,
    revision: 1,
    total: rows.length,
    rows,
    counts: Object.fromEntries(
      progressStatuses.map((status) => [status, rows.filter((row) => row.status === status).length])
    ) as PublishProgress['counts'],
  };
}
export function parsePublishOperation(
  value: unknown,
  payload: DraftPublishRequest,
  operationId?: string
): PublishOperation {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    (operationId && value.id !== operationId) ||
    value.kind !== 'youtube.metadata_publish' ||
    value.channel_id !== payload.stage_snapshot.youtube_channel_id ||
    !record(value.plan) ||
    value.plan.stage_snapshot?.stage_id !== payload.stage_snapshot.stage_id ||
    !Array.isArray(value.plan.edits) ||
    value.plan.edits.length !== payload.edits.length ||
    !value.plan.edits.every((edit: any, index: number) =>
      ['video_id', 'title', 'description', 'skip'].every((key) => edit[key] === (payload.edits[index] as any)[key])
    ) ||
    !['prepared', 'running', 'completed', 'partial', 'needs_reconciliation', 'failed_before_write'].includes(
      value.state
    )
  )
    invalid();
  if (!value.progress && value.version === 1) value = { ...value, progress: legacyProgress(value, payload) };
  if (!record(value)) invalid();
  parsePublishProgress(value.progress, payload);
  if (!['prepared', 'running'].includes(value.state) && (value.progress.counts.queued || value.progress.counts.running))
    invalid();
  return value as PublishOperation;
}
export function parsePublishAcceptance(value: unknown, payload: DraftPublishRequest) {
  if (
    !record(value) ||
    value.version !== 1 ||
    typeof value.operation_id !== 'string' ||
    !value.operation_id ||
    typeof value.state !== 'string'
  )
    invalid();
  const progress = parsePublishProgress(value.progress, payload);
  return { operation_id: value.operation_id as string, state: value.state as string, progress };
}
