import { legacyPersonKey } from '../features/sheets/model/personOptions';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../services/api';
import useSharedTeamPersonFilterPersistence from './useSharedTeamPersonFilterPersistence';

vi.mock('../services/api', () => ({
  api: {
    updateTeamPersonFilter: vi.fn(),
  },
}));

describe('useSharedTeamPersonFilterPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => vi.useRealTimers());

  it('waits for readiness and saves one normalized shared filter', async () => {
    api.updateTeamPersonFilter.mockResolvedValue({ configured: true, team: '團體', selected_people: ['甲'] });
    const { result, rerender } = renderHook((props) => useSharedTeamPersonFilterPersistence(props), {
      initialProps: {
        team: ' 團體 ',
        selectedPeople: [' 甲 ', '甲', ''],
        ready: false,
      },
    });

    expect(api.updateTeamPersonFilter).not.toHaveBeenCalled();
    rerender({ team: ' 團體 ', selectedPeople: [' 甲 ', '甲', ''], ready: true });

    await waitFor(() => expect(api.updateTeamPersonFilter).toHaveBeenCalledTimes(1), { timeout: 2000 });
    await waitFor(() => expect(result.current.saved).toBe(true), { timeout: 2000 });

    expect(api.updateTeamPersonFilter).toHaveBeenCalledTimes(1);
    expect(api.updateTeamPersonFilter).toHaveBeenCalledWith({
      team: '團體',
      teams: ['團體'],
      query: '',
      selectedPeople: [legacyPersonKey('甲', '團體')],
    });
    expect(result.current.saved).toBe(true);
    expect(result.current.error).toBe('');
  });

  it('reports a failed sync and retries without changing the desired filter', async () => {
    const onError = vi.fn();
    api.updateTeamPersonFilter
      .mockRejectedValueOnce(new Error('網路中斷'))
      .mockResolvedValueOnce({ configured: true, team: '團體', selected_people: ['甲'] });
    const { result } = renderHook((props) => useSharedTeamPersonFilterPersistence(props), {
      initialProps: { team: '團體', selectedPeople: ['甲'], ready: true, onError },
    });

    await waitFor(() => expect(result.current.error).toBe('帳號隊伍／人物篩選同步失敗：網路中斷'), { timeout: 2000 });
    expect(result.current.error).toBe('帳號隊伍／人物篩選同步失敗：網路中斷');
    expect(onError).toHaveBeenLastCalledWith('帳號隊伍／人物篩選同步失敗：網路中斷');

    await act(async () => {
      await result.current.retry();
    });

    expect(api.updateTeamPersonFilter).toHaveBeenCalledTimes(2);
    expect(api.updateTeamPersonFilter).toHaveBeenLastCalledWith({
      team: '團體',
      teams: ['團體'],
      query: '',
      selectedPeople: [legacyPersonKey('甲', '團體')],
    });
    expect(result.current.saved).toBe(true);
    expect(result.current.error).toBe('');
    expect(onError).toHaveBeenLastCalledWith('');
  });

  it('skips initial PUT when initialSavedFilter matches current values and invokes onSaved on subsequent updates', async () => {
    const onSaved = vi.fn();
    const serverFilter = {
      configured: true,
      team: '團體 A',
      teams: ['團體 A'],
      query: '',
      selected_people: [legacyPersonKey('甲', '團體 A')],
    };
    const savedResponse = {
      configured: true,
      team: '團體 A',
      teams: ['團體 A', '團體 B'],
      query: '',
      selected_people: [legacyPersonKey('甲', '團體 A')],
    };
    api.updateTeamPersonFilter.mockResolvedValue(savedResponse);

    const { rerender } = renderHook((props) => useSharedTeamPersonFilterPersistence(props), {
      initialProps: {
        team: '團體 A',
        teams: ['團體 A'],
        query: '',
        selectedPeople: [legacyPersonKey('甲', '團體 A')],
        initialSavedFilter: serverFilter,
        onSaved,
        ready: false,
      },
    });

    rerender({
      team: '團體 A',
      teams: ['團體 A'],
      query: '',
      selectedPeople: [legacyPersonKey('甲', '團體 A')],
      initialSavedFilter: serverFilter,
      onSaved,
      ready: true,
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    expect(api.updateTeamPersonFilter).not.toHaveBeenCalled();

    rerender({
      team: '團體 A',
      teams: ['團體 A', '團體 B'],
      query: '',
      selectedPeople: [legacyPersonKey('甲', '團體 A')],
      initialSavedFilter: serverFilter,
      onSaved,
      ready: true,
    });

    await waitFor(() => expect(api.updateTeamPersonFilter).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(onSaved).toHaveBeenCalledWith(savedResponse);
  });

  it('flushes dirty debounced changes on unmount', async () => {
    const onSaved = vi.fn();
    const serverFilter = { configured: true, team: '', teams: [], query: '', selected_people: [] };
    const savedResponse = {
      configured: true,
      team: '',
      teams: ['團體 A'],
      query: '',
      selected_people: [legacyPersonKey('甲', '團體 A')],
    };
    api.updateTeamPersonFilter.mockResolvedValueOnce(savedResponse);

    const { rerender, unmount } = renderHook((props) => useSharedTeamPersonFilterPersistence(props), {
      initialProps: {
        team: '',
        teams: [],
        query: '',
        selectedPeople: [],
        initialSavedFilter: serverFilter,
        onSaved,
        ready: true,
      },
    });

    rerender({
      team: '',
      teams: ['團體 A'],
      query: '',
      selectedPeople: [legacyPersonKey('甲', '團體 A')],
      initialSavedFilter: serverFilter,
      onSaved,
      ready: true,
    });

    expect(api.updateTeamPersonFilter).not.toHaveBeenCalled();
    unmount();

    await waitFor(() => expect(api.updateTeamPersonFilter).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(savedResponse));
  });
});
