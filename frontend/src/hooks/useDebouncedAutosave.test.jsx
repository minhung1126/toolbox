import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedAutosave } from './useDebouncedAutosave';

describe('useDebouncedAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces saves until timer elapses', async () => {
    const onSave = vi.fn().mockResolvedValue({});
    const onSuccess = vi.fn();

    const { result } = renderHook(() =>
      useDebouncedAutosave({
        value: { foo: 'bar' },
        delay: 500,
        onSave,
        onSuccess,
      })
    );

    act(() => {
      result.current.mutate({ foo: 'updated' });
    });

    expect(result.current.dirty).toBe(true);
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(499);
    });
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith({ foo: 'updated' });
    expect(onSuccess).toHaveBeenCalled();
    expect(result.current.dirty).toBe(false);
  });

  it('flushes pending changes immediately when flush is called', async () => {
    const onSave = vi.fn().mockResolvedValue({});

    const { result } = renderHook(() =>
      useDebouncedAutosave({
        value: { foo: 'bar' },
        delay: 500,
        onSave,
      })
    );

    act(() => {
      result.current.mutate({ foo: 'flushed' });
    });

    await act(async () => {
      await result.current.flush({ notify: true });
    });

    expect(onSave).toHaveBeenCalledWith({ foo: 'flushed' });
  });

  it('flushes on unmount if dirty and not already saved', async () => {
    const onSave = vi.fn().mockResolvedValue({});

    const { result, unmount } = renderHook(() =>
      useDebouncedAutosave({
        value: { foo: 'initial' },
        delay: 500,
        onSave,
      })
    );

    act(() => {
      result.current.mutate({ foo: 'on-unmount' });
    });

    expect(onSave).not.toHaveBeenCalled();

    unmount();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith({ foo: 'on-unmount' });
  });

  it('maintains stable callback identity even when recreated callbacks are passed', () => {
    let callCount = 0;
    const { result, rerender } = renderHook(() => {
      callCount += 1;
      return useDebouncedAutosave({
        value: { count: callCount },
        delay: 500,
        onSave: async () => {},
      });
    });

    const firstMutate = result.current.mutate;
    const firstFlush = result.current.flush;
    const firstReset = result.current.reset;

    rerender();

    expect(result.current.mutate).toBe(firstMutate);
    expect(result.current.flush).toBe(firstFlush);
    expect(result.current.reset).toBe(firstReset);
  });
});
