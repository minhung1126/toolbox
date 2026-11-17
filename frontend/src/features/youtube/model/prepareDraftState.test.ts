import { describe, expect, it } from 'vitest';
import { prepareDraftAvailability, type PrepareDraftState } from './prepareDraftState';
const ready: PrepareDraftState = {
  preparing: false,
  executing: false,
  loadingSheet: false,
  loadingVideos: false,
  hydrated: true,
  authenticated: true,
  channel: 'channel',
  sourceReady: true,
  sourceStale: false,
  worksheet: 'Sheet',
  titleColumn: 'Title',
  descriptionColumn: 'Description',
  assignedCount: 1,
};
describe('prepare draft eligibility', () => {
  it('allows an independent preview or quota read without a prepare dependency', () => {
    expect(prepareDraftAvailability({ ...ready, ...{ loadingPreview: true, estimateLoading: true } })).toEqual({
      canPrepare: true,
      reason: '',
    });
  });
  it.each([
    { preparing: true },
    { executing: true },
    { loadingSheet: true },
    { loadingVideos: true },
    { hydrated: false },
    { authenticated: false },
    { channel: '' },
    { sourceReady: false },
    { sourceStale: true },
    { worksheet: '' },
    { titleColumn: '' },
    { descriptionColumn: '' },
    { assignedCount: 0 },
  ])('explains blocked state %o without bypassing required validation', (patch) => {
    expect(prepareDraftAvailability({ ...ready, ...patch })).toEqual({ canPrepare: false, reason: expect.any(String) });
    expect(prepareDraftAvailability({ ...ready, ...patch }).reason.length).toBeGreaterThan(0);
    expect(prepareDraftAvailability(ready).canPrepare).toBe(true);
  });
});
