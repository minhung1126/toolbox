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
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
function invalid(): never {
  throw new Error('作業進度格式或頻道不符，已保留待核對狀態與手動內容。');
}
export function parsePublishProgress(value: unknown, payload: DraftPublishRequest): PublishProgress {
  if (
    !record(value) ||
    value.version !== 1 ||
    !Number.isInteger(value.revision) ||
    (value.revision as number) < 1 ||
    value.total !== payload.edits.length ||
    !Array.isArray(value.rows) ||
    value.rows.length !== value.total ||
    !record(value.counts)
  )
    invalid();
  const counts = value.counts as Record<string, unknown>;
  const rows = value.rows as Array<Record<string, unknown>>;
  if (
    !value.rows.every(
      (row: unknown, index: number) =>
        record(row) &&
        row.video_id === payload.edits[index].video_id &&
        row.title === payload.edits[index].title &&
        row.description === payload.edits[index].description &&
        typeof row.status === 'string' &&
        (progressStatuses as readonly string[]).includes(row.status) &&
        Array.isArray(row.attempted_parts) &&
        row.attempted_parts.every((part: unknown) => ['snippet', 'status'].includes(String(part))) &&
        (row.reason === undefined || typeof row.reason === 'string') &&
        (row.confirmation === null || typeof row.confirmation === 'string') &&
        (row.status !== 'succeeded' ||
          (typeof row.confirmation === 'string' &&
            ['provider_response', 'provider_read', 'legacy_evidence'].includes(row.confirmation))) &&
        (row.status !== 'unchanged' ||
          (typeof row.confirmation === 'string' && ['provider_read', 'legacy_evidence'].includes(row.confirmation)))
    )
  )
    invalid();
  if (
    !progressStatuses.every(
      (status) =>
        Number.isInteger(counts[status]) &&
        (counts[status] as number) >= 0 &&
        counts[status] === rows.filter((row) => row.status === status).length
    )
  )
    invalid();
  return value as unknown as PublishProgress;
}
function legacyProgress(value: Record<string, unknown>, payload: DraftPublishRequest): PublishProgress {
  const rawResult = record(value.result) && Array.isArray(value.result.results) ? value.result.results : [];
  const rawItems = Array.isArray(value.items) ? value.items : [];
  const rows = payload.edits.map((edit) => {
    const result = rawResult.find(
      (row): row is Record<string, unknown> => record(row) && row.video_id === edit.video_id
    );
    if (result && (result.title !== edit.title || result.description !== edit.description)) invalid();
    const attempts = rawItems.filter(
      (item): item is Record<string, unknown> => record(item) && item.remote_id === edit.video_id
    );
    const lastAttempt = attempts.at(-1);
    const intendedParts =
      lastAttempt && record(lastAttempt.intended) && Array.isArray(lastAttempt.intended.parts)
        ? lastAttempt.intended.parts.map(String)
        : [];
    const status = (
      typeof result?.status === 'string'
        ? result.status
        : edit.skip
          ? 'skipped'
          : value.state === 'failed_before_write'
            ? 'not_attempted'
            : 'needs_reconciliation'
    ) as ProgressStatus;
    return {
      ...edit,
      person: '',
      status,
      attempted_parts: intendedParts,
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
    !record(value.plan.stage_snapshot) ||
    value.plan.stage_snapshot.stage_id !== payload.stage_snapshot.stage_id ||
    !Array.isArray(value.plan.edits) ||
    value.plan.edits.length !== payload.edits.length ||
    !value.plan.edits.every(
      (edit: unknown, index: number) =>
        record(edit) &&
        edit.video_id === payload.edits[index].video_id &&
        edit.title === payload.edits[index].title &&
        edit.description === payload.edits[index].description &&
        edit.skip === payload.edits[index].skip
    ) ||
    typeof value.state !== 'string' ||
    !['prepared', 'running', 'completed', 'partial', 'needs_reconciliation', 'failed_before_write'].includes(
      value.state
    )
  )
    invalid();
  let normalized: Record<string, unknown> = value;
  if (!normalized.progress && normalized.version === 1) {
    normalized = { ...normalized, progress: legacyProgress(normalized, payload) };
  }
  const progress = parsePublishProgress(normalized.progress, payload);
  if (
    !['prepared', 'running'].includes(String(normalized.state)) &&
    (progress.counts.queued || progress.counts.running)
  )
    invalid();
  return normalized as unknown as PublishOperation;
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
