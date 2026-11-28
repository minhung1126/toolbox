import { describe, expect, it } from 'vitest';
import { parseCleanupPreview, parseCleanupResult, type CleanupItem } from './publishCleanupApi';

const item: CleanupItem = {
  playlist_id: 'playlist',
  playlist_item_id: 'item',
  video_id: 'video',
  title: 'Title',
  description: '',
  observed_privacy: 'public',
  candidate: true,
  reason: 'public',
};
const snapshot = {
  version: 2,
  mode: 'cleanup_only',
  playlist_id: 'playlist',
  youtube_channel_id: 'channel',
  youtube_slot: 'primary',
  items: [item],
};
const preview = {
  ...snapshot,
  total_count: 1,
  candidate_count: 1,
  counts: { public: 1, private: 0, unlisted: 0, unknown: 0 },
  preview_token: 'signed',
  preview_snapshot: snapshot,
};
const result = {
  version: 2,
  mode: 'cleanup_only',
  operation: 'youtube.publish_cleanup',
  completed: false,
  total_count: 1,
  succeeded_count: 0,
  skipped_count: 0,
  failed_count: 0,
  not_attempted_count: 0,
  needs_reconciliation_count: 1,
  quota_blocked: false,
  results: [{ ...item, status: 'needs_reconciliation' }],
};

describe('cleanup v2 contracts', () => {
  it('accepts exact item snapshots and preserves unknown results', () => {
    expect(parseCleanupPreview(preview, 'playlist')).toEqual(preview);
    expect(parseCleanupResult(result, [item])).toEqual(result);
  });
  it.each([
    { ...preview, total_count: 2 },
    { ...preview, counts: { ...preview.counts, public: 2 } },
    { ...preview, preview_snapshot: { ...snapshot, items: [] } },
    { ...preview, items: [{ ...item, observed_privacy: 'private' }] },
    { ...preview, version: 1 },
  ])('rejects invalid preview counts, privacy, version or identity', (value) => {
    expect(() => parseCleanupPreview(value, 'playlist')).toThrow();
  });
  it.each([
    { ...result, completed: true },
    { ...result, needs_reconciliation_count: 0 },
    { ...result, results: [{ ...item, playlist_item_id: 'other', status: 'succeeded' }] },
    { ...result, results: [] },
  ])('never accepts malformed or mismatched cleanup results', (value) => {
    expect(() => parseCleanupResult(value, [item])).toThrow();
  });
});
