import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { api } from '../services/api';
import useTeamPersonFilter from './useTeamPersonFilter';
import { personKey } from '../features/sheets/model/personOptions';

afterEach(() => vi.restoreAllMocks());
const a = { team: 'A', person: '甲', kind: 'person' };
const b = { team: 'B', person: '乙', kind: 'person' };

describe('useTeamPersonFilter', () => {
  it('reports malformed provider options instead of silently showing no teams', async () => {
    vi.spyOn(api, 'parseSheetOptions').mockResolvedValue({ teams: [null] });
    const { result } = renderHook(() => useTeamPersonFilter({ source: 'sheet', worksheetName: '工作表' }));
    await waitFor(() => expect(result.current.error).toContain('工作表團體選項回應格式不正確'));
    expect(result.current.ready).toBe(false);
  });

  it('loads everyone without choosing a team and retains selections across team/search filters', async () => {
    const apiClient = { parseSheetOptions: vi.fn().mockResolvedValue({ teams: ['A', 'B'], people: [a, b] }) };
    const { result } = renderHook(() => useTeamPersonFilter({ source: 'sheet', worksheetName: '工作表', apiClient }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.people).toEqual([a, b]);
    expect(result.current.selectedTeams).toEqual([]);
    expect(result.current.selectedPeople).toEqual([]);
    act(() => result.current.setSelectedPeople([personKey(a)]));
    act(() => {
      result.current.setSelectedTeams(['B']);
      result.current.setQuery('乙');
    });
    act(() => result.current.setSelectedPeople([personKey(a), personKey(b)]));
    act(() => {
      result.current.setQuery('');
      result.current.setSelectedTeams([]);
    });
    expect(result.current.selectedPeople).toEqual([personKey(a), personKey(b)]);
    expect(apiClient.parseSheetOptions).toHaveBeenCalledTimes(1);
  });

  it('ignores an older response after changing worksheet', async () => {
    let resolveOld;
    const apiClient = {
      parseSheetOptions: vi
        .fn()
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveOld = resolve;
          })
        )
        .mockResolvedValueOnce({ teams: ['B'], people: [b] }),
    };
    const { result, rerender } = renderHook((props) => useTeamPersonFilter({ source: 'sheet', ...props, apiClient }), {
      initialProps: { worksheetName: 'old' },
    });
    rerender({ worksheetName: 'new' });
    await waitFor(() => expect(result.current.people).toEqual([b]));
    await act(async () => resolveOld({ teams: ['A'], people: [a] }));
    expect(result.current.people).toEqual([b]);
  });

  it('migrates a legacy selection and keeps it while temporarily disabled or after failed refresh', async () => {
    const apiClient = { parseSheetOptions: vi.fn().mockResolvedValue({ teams: ['A'], people: [a] }) };
    const { result, rerender } = renderHook(
      (props) =>
        useTeamPersonFilter({
          source: 'sheet',
          worksheetName: 'sheet',
          initialTeam: 'A',
          initialSelectedPeople: ['甲'],
          ...props,
          apiClient,
        }),
      { initialProps: { enabled: true, refreshKey: 0 } }
    );
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.selectedPeople).toEqual([personKey(a)]);
    rerender({ enabled: false, refreshKey: 0 });
    expect(result.current.selectedPeople).toEqual([personKey(a)]);
    apiClient.parseSheetOptions.mockRejectedValue(new Error('offline'));
    rerender({ enabled: true, refreshKey: 1 });
    await waitFor(() => expect(result.current.error).toContain('offline'));
    expect(result.current.selectedPeople).toEqual([personKey(a)]);
    expect(result.current.ready).toBe(false);
  });

  it('preserves selectedTeams and selectedPeople from other worksheets when switching worksheets', async () => {
    const apiClient = {
      parseSheetOptions: vi
        .fn()
        .mockResolvedValueOnce({ teams: ['A', 'B'], people: [a, b] })
        .mockResolvedValueOnce({ teams: ['A'], people: [a] }),
    };
    const { result, rerender } = renderHook(
      (props) =>
        useTeamPersonFilter({
          source: 'sheet',
          ...props,
          initialTeams: ['A', 'B'],
          initialSelectedPeople: [personKey(a), personKey(b)],
          apiClient,
        }),
      { initialProps: { worksheetName: 'sheet1' } }
    );

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.selectedTeams).toEqual(['A', 'B']);
    expect(result.current.selectedPeople).toEqual([personKey(a), personKey(b)]);

    rerender({ worksheetName: 'sheet2' });
    await waitFor(() => expect(result.current.teams).toEqual(['A']));
    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.selectedTeams).toEqual(['A', 'B']);
    expect(result.current.selectedPeople).toEqual([personKey(a), personKey(b)]);
  });
});

it('honors an explicitly empty team filter while retaining the legacy migration team', () => {
  const { result } = renderHook(() => useTeamPersonFilter({ enabled: false, initialTeam: 'A', initialTeams: [] }));
  expect(result.current.selectedTeams).toEqual([]);
  act(() => result.current.resetSelection({ team: 'A', teams: [], selectedPeople: ['甲'] }));
  expect(result.current.selectedTeams).toEqual([]);
  expect(result.current.selectedPeople).toEqual([personKey(a)]);
});
