import { beforeEach, expect, it } from 'vitest';
import { currentDraftContext, draftContext, rememberDraftContext } from './draftPublishStorage';
import type { DraftSource } from '../api/draftPublishApi';
const source: DraftSource = {
  spreadsheet_url_or_id: 'sheet',
  playlist_id: 'playlist',
  video_type: 'Video',
  worksheet_name: 'Videos',
  title_column: 'Title',
  description_column: 'Description',
  team: '',
  assignments: [{ video_id: 'one', person: 'Alice' }],
};
beforeEach(() => localStorage.clear());
it('isolates source and assignment changes by account, channel, and video type', () => {
  rememberDraftContext('owner', source, 'channel-a');
  const changed = { ...source, worksheet_name: 'Other' };
  rememberDraftContext('owner', changed, 'channel-b');
  rememberDraftContext('other-owner', changed, 'channel-a');
  rememberDraftContext('owner', { ...changed, video_type: 'Shorts' }, 'channel-a');
  expect(currentDraftContext('owner', 'Video', 'channel-a')).toBe(draftContext(source));
  expect(currentDraftContext('owner', 'Video', 'channel-b')).toBe(draftContext(changed));
  expect(currentDraftContext('owner', 'Shorts', 'channel-a')).not.toBe(draftContext(source));
});
it('preserves assignment context when revisiting the same source before videos are reloaded', () => {
  rememberDraftContext('owner', source, 'channel-a');
  rememberDraftContext('owner', { ...source, assignments: [] }, 'channel-a');
  expect(currentDraftContext('owner', 'Video', 'channel-a')).toBe(draftContext(source));
  rememberDraftContext('owner', { ...source, worksheet_name: 'Changed', assignments: [] }, 'channel-a');
  expect(currentDraftContext('owner', 'Video', 'channel-a')).toContain('Changed');
});

it('keeps legacy source validation while migrating revisited assignments into a channel scope', () => {
  const legacy = 'toolbox:youtube-draft-context:v1:owner:Video';
  localStorage.setItem(legacy, draftContext(source));
  expect(currentDraftContext('owner', 'Video', 'channel-a')).toBe(draftContext(source));
  rememberDraftContext('owner', { ...source, assignments: [] }, 'channel-a');
  localStorage.setItem(legacy, draftContext({ ...source, worksheet_name: 'Other channel' }));
  expect(currentDraftContext('owner', 'Video', 'channel-a')).toBe(draftContext(source));
});
