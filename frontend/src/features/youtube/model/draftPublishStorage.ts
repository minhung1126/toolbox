import type { DraftStage, DraftSource, FinalEdit, DraftResult, DraftPublishRequest } from '../api/draftPublishApi';

import type { OperationReference } from '../hooks/useDraftPublishOperation';

export interface SavedPublishDraft extends DraftStage {
  account: string;
  source: DraftSource;
  context: string;
  edits: FinalEdit[];
  result?: DraftResult;
  pending?: DraftPublishRequest;
  operation_ref?: OperationReference;
}
function key(account: string, channel: string, type: string) {
  return `toolbox:youtube-publish-draft:v1:${encodeURIComponent(account)}:${encodeURIComponent(channel)}:${type}`;
}
function contextKey(account: string, type: string, channel: string) {
  return `toolbox:youtube-draft-context:v1:${encodeURIComponent(account)}:${encodeURIComponent(channel)}:${type}`;
}
export function draftContext(source: DraftSource) {
  return JSON.stringify(source);
}
export function rememberDraftContext(account: string, source: DraftSource, channel: string) {
  const storageKey = contextKey(account, source.video_type, channel);
  const previous = currentDraftContext(account, source.video_type, channel);
  if (!source.assignments.length && previous) {
    try {
      const old = JSON.parse(previous) as DraftSource;
      if (JSON.stringify({ ...old, assignments: [] }) === JSON.stringify(source)) {
        localStorage.setItem(storageKey, previous);
        return;
      }
    } catch {
      /* Replace malformed context with the current explicit source. */
    }
  }
  localStorage.setItem(storageKey, draftContext(source));
}
export function currentDraftContext(account: string, type: string, channel: string) {
  // Preserve the old source-change guard until this channel is explicitly read again.
  return (
    localStorage.getItem(contextKey(account, type, channel)) ??
    localStorage.getItem(`toolbox:youtube-draft-context:v1:${encodeURIComponent(account)}:${type}`)
  );
}
export function createSavedDraft(stage: DraftStage, account: string, source: DraftSource): SavedPublishDraft {
  return {
    ...stage,
    account,
    source,
    context: draftContext(source),
    edits: stage.stage_snapshot.plan.map((item) => ({
      video_id: item.video_id,
      title: item.newTitle,
      description: item.newDescription,
      skip: item.status === 'skipped' || item.default_skip === true,
    })),
  };
}
export function savePublishDraft(draft: SavedPublishDraft) {
  const snapshot = draft.stage_snapshot;
  localStorage.setItem(key(draft.account, snapshot.youtube_channel_id, snapshot.video_type), JSON.stringify(draft));
}
export function loadPublishDraft(account: string, channel: string, type: string): SavedPublishDraft | null {
  const raw = localStorage.getItem(key(account, channel, type));
  if (!raw) return null;
  const draft = JSON.parse(raw) as SavedPublishDraft;
  if (
    draft.account !== account ||
    draft.stage_snapshot?.youtube_channel_id !== channel ||
    draft.stage_snapshot.video_type !== type ||
    typeof draft.stage_token !== 'string' ||
    !Array.isArray(draft.stage_snapshot.plan) ||
    !Array.isArray(draft.edits) ||
    draft.edits.length !== draft.stage_snapshot.plan.length ||
    !draft.edits.every(
      (edit, index) =>
        edit.video_id === draft.stage_snapshot.plan[index]?.video_id &&
        typeof edit.title === 'string' &&
        typeof edit.description === 'string' &&
        typeof edit.skip === 'boolean'
    )
  )
    throw new Error('暫存資料與目前帳號／頻道不符，請返回人物指定重建暫存。');
  return draft;
}
