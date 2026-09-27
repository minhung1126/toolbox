import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../services/api';
import useAccountWorkState, { AccountWorkStateProvider } from './useAccountWorkState';

vi.mock('../services/api', () => ({
  api: {
    updateWorkState: vi.fn(),
  },
}));

function wrapper({ children }) {
  return (
    <AccountWorkStateProvider initialState={{ navigation: { sidebarCollapsed: false } }}>
      {children}
    </AccountWorkStateProvider>
  );
}

describe('useAccountWorkState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => vi.useRealTimers());

  it('debounces a save and merges the server state after it succeeds', async () => {
    vi.useFakeTimers();
    api.updateWorkState.mockResolvedValue({
      state: { navigation: { sidebarCollapsed: true, serverRevision: 3 } },
    });
    const { result } = renderHook(() => useAccountWorkState('navigation'), { wrapper });

    let savePromise;
    act(() => {
      savePromise = result.current.save({ sidebarCollapsed: true }, { debounceMs: 50 });
    });

    expect(api.updateWorkState).not.toHaveBeenCalled();
    expect(result.current.value).toEqual({ sidebarCollapsed: true });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
      await savePromise;
    });

    expect(api.updateWorkState).toHaveBeenCalledWith('navigation', { sidebarCollapsed: true });
    expect(result.current.value).toEqual({ sidebarCollapsed: true, serverRevision: 3 });
    expect(result.current.saved).toBe(true);
    expect(result.current.saving).toBe(false);
  });

  it('keeps command references stable when the stored state changes', async () => {
    api.updateWorkState.mockResolvedValue({ state: { navigation: { sidebarCollapsed: true } } });
    const { result } = renderHook(() => useAccountWorkState('navigation'), { wrapper });
    const initialSave = result.current.save;
    const initialRetry = result.current.retry;

    await act(async () => {
      await result.current.save({ sidebarCollapsed: true }, { debounceMs: 0 });
    });

    expect(result.current.save).toBe(initialSave);
    expect(result.current.retry).toBe(initialRetry);
  });

  it('persists a newer value after an earlier request is already in flight', async () => {
    let releaseFirst;
    api.updateWorkState
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirst = resolve;
          })
      )
      .mockResolvedValueOnce({ state: { navigation: { sidebarCollapsed: true } } });
    const { result } = renderHook(() => useAccountWorkState('navigation'), { wrapper });

    let firstSave;
    await act(async () => {
      firstSave = result.current.save({ sidebarCollapsed: false }, { debounceMs: 0 });
      await Promise.resolve();
    });
    expect(api.updateWorkState).toHaveBeenCalledTimes(1);

    let secondSave;
    act(() => {
      secondSave = result.current.save({ sidebarCollapsed: true }, { debounceMs: 0 });
    });

    await act(async () => {
      releaseFirst({ state: { navigation: { sidebarCollapsed: false } } });
      await firstSave;
      await secondSave;
    });

    expect(api.updateWorkState).toHaveBeenNthCalledWith(1, 'navigation', { sidebarCollapsed: false });
    expect(api.updateWorkState).toHaveBeenNthCalledWith(2, 'navigation', { sidebarCollapsed: true });
    expect(result.current.value).toEqual({ sidebarCollapsed: true });
    expect(result.current.saved).toBe(true);
  });

  it('exposes a failed save and retries the latest desired value', async () => {
    api.updateWorkState
      .mockRejectedValueOnce(new Error('伺服器忙碌'))
      .mockResolvedValueOnce({ state: { navigation: { sidebarCollapsed: true } } });
    const { result } = renderHook(() => useAccountWorkState('navigation'), { wrapper });

    await act(async () => {
      await result.current.save({ sidebarCollapsed: true }, { debounceMs: 0 });
    });
    expect(result.current.error).toBe('伺服器忙碌');
    expect(result.current.saved).toBe(false);

    await act(async () => {
      await result.current.retry();
    });

    expect(api.updateWorkState).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBe('');
    expect(result.current.saved).toBe(true);
  });

  it('does not acknowledge malformed saves and allows retrying the pending change', async () => {
    api.updateWorkState
      .mockResolvedValueOnce({ state: [] })
      .mockResolvedValueOnce({ state: { navigation: { sidebarCollapsed: true } } });
    const { result } = renderHook(() => useAccountWorkState('navigation'), { wrapper });

    await act(async () => {
      await result.current.save({ sidebarCollapsed: true }, { debounceMs: 0 });
    });
    expect(result.current.saved).toBe(false);
    expect(result.current.error).toBe('帳號工作狀態回應格式不正確。');
    expect(result.current.value).toEqual({ sidebarCollapsed: true });

    await act(async () => {
      await result.current.retry();
    });
    expect(api.updateWorkState).toHaveBeenNthCalledWith(2, 'navigation', { sidebarCollapsed: true });
    expect(result.current.saved).toBe(true);
    expect(result.current.error).toBe('');
  });

  it('does not acknowledge a write response that omits the saved key', async () => {
    api.updateWorkState.mockResolvedValue({ state: {} });
    const { result } = renderHook(() => useAccountWorkState('navigation'), { wrapper });

    await act(async () => {
      await result.current.save({ sidebarCollapsed: true }, { debounceMs: 0 });
    });

    expect(result.current.saved).toBe(false);
    expect(result.current.error).toBe('帳號工作狀態寫入結果不一致，請重新整理核對。');
  });

  it('keeps newer values for other keys when full-state write responses arrive out of order', async () => {
    const pending = {};
    api.updateWorkState.mockImplementation(
      (key) =>
        new Promise((resolve) => {
          pending[key] = resolve;
        })
    );
    const { result } = renderHook(
      () => ({
        navigation: useAccountWorkState('navigation'),
        sheetCopy: useAccountWorkState('sheet_copy'),
      }),
      { wrapper }
    );

    let navigationSave;
    let sheetSave;
    await act(async () => {
      navigationSave = result.current.navigation.save({ sidebarCollapsed: true }, { debounceMs: 0 });
      sheetSave = result.current.sheetCopy.save({ query: 'new' }, { debounceMs: 0 });
      await Promise.resolve();
    });
    expect(api.updateWorkState).toHaveBeenCalledTimes(2);

    await act(async () => {
      pending.sheet_copy({ state: { navigation: { sidebarCollapsed: false }, sheet_copy: { query: 'new' } } });
      await sheetSave;
    });
    expect(result.current.navigation.value).toEqual({ sidebarCollapsed: true });
    expect(result.current.sheetCopy.value).toEqual({ query: 'new' });

    await act(async () => {
      pending.navigation({ state: { navigation: { sidebarCollapsed: true }, sheet_copy: { query: 'old' } } });
      await navigationSave;
    });
    expect(result.current.navigation.value).toEqual({ sidebarCollapsed: true });
    expect(result.current.sheetCopy.value).toEqual({ query: 'new' });
  });
});
