import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOAuthConnect } from './useOAuthConnect';

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
};

vi.mock('../components/Toast', () => ({
  useToast: () => mockToast,
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/test', search: '?tab=1' }),
}));

describe('useOAuthConnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles connect success by redirecting to auth url', async () => {
    const getAuthUrl = vi.fn().mockResolvedValue({ auth_url: 'https://accounts.google.com/auth' });
    const disconnect = vi.fn();
    const navigateToAuth = vi.fn();

    const { result } = renderHook(() =>
      useOAuthConnect({
        serviceName: 'test_service',
        getAuthUrl,
        disconnect,
        navigateToAuth,
        serviceLabel: '測試服務',
      })
    );

    await act(async () => {
      await result.current.handleConnect();
    });

    expect(getAuthUrl).toHaveBeenCalledTimes(1);
    expect(navigateToAuth).toHaveBeenCalledWith('https://accounts.google.com/auth');
  });

  it('handles disconnect with confirmation and callbacks', async () => {
    const getAuthUrl = vi.fn();
    const disconnect = vi.fn().mockResolvedValue({});
    const onAfterDisconnect = vi.fn().mockResolvedValue({});

    const { result } = renderHook(() =>
      useOAuthConnect({
        serviceName: 'test_service',
        getAuthUrl,
        disconnect,
        onAfterDisconnect,
        serviceLabel: '測試服務',
      })
    );

    expect(result.current.confirmDisconnect).toBe(false);

    act(() => {
      result.current.setConfirmDisconnect(true);
    });
    expect(result.current.confirmDisconnect).toBe(true);

    await act(async () => {
      await result.current.handleConfirmDisconnect();
    });

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(onAfterDisconnect).toHaveBeenCalledTimes(1);
    expect(mockToast.success).toHaveBeenCalledWith('已解除 測試服務');
    expect(result.current.confirmDisconnect).toBe(false);
  });
});
