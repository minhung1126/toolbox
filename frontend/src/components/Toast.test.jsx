import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './Toast';

function ToastDemo() {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.success('設定已儲存')}>
      顯示提示
    </button>
  );
}

describe('ToastProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders an immediate toast message', () => {
    render(
      <ToastProvider>
        <ToastDemo />
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: '顯示提示' }));
    expect(screen.getByText('設定已儲存')).toBeInTheDocument();
  });

  it('cleans up pending exit timers on unmount without leaving stray timeouts', () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const view = render(
      <ToastProvider>
        <ToastDemo />
      </ToastProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: '顯示提示' }));
    fireEvent.click(screen.getByRole('button', { name: '關閉通知' }));
    fireEvent.click(screen.getByRole('button', { name: '關閉通知' }));

    view.unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });
  });
});
