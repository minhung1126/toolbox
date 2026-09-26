import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../services/api';
import { workStateApi } from './workStateApi';

vi.mock('../../../services/api', () => ({
  api: { getWorkState: vi.fn(), updateWorkState: vi.fn() },
}));

describe('workStateApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves feature-specific state and forwards updates without changing the wire contract', async () => {
    const value = { filters: ['a', 'b'], nested: { enabled: true }, optional: null };
    const response = { version: 1, state: { newTool: value } };
    api.getWorkState.mockResolvedValue(response);
    api.updateWorkState.mockResolvedValue(response);
    await expect(workStateApi.get()).resolves.toBe(response);
    await expect(workStateApi.update('newTool', value)).resolves.toBe(response);
    expect(api.updateWorkState).toHaveBeenCalledWith('newTool', value);
  });

  it('accepts unversioned legacy responses', async () => {
    api.getWorkState.mockResolvedValue({ state: {} });
    await expect(workStateApi.get()).resolves.toEqual({ state: {} });
  });

  it.each([
    null,
    {},
    { state: [] },
    { state: null },
    { state: { navigation: true } },
    { state: { tool: [] } },
    { version: 2, state: {} },
  ])('rejects malformed or unsupported responses: %j', async (response) => {
    api.getWorkState.mockResolvedValue(response);
    api.updateWorkState.mockResolvedValue(response);
    await expect(workStateApi.get()).rejects.toThrow('帳號工作狀態回應格式不正確');
    await expect(workStateApi.update('navigation', {})).rejects.toThrow('帳號工作狀態回應格式不正確');
  });

  it('preserves transport errors for the existing retry flow', async () => {
    const error = new Error('連線失敗');
    api.getWorkState.mockRejectedValue(error);
    api.updateWorkState.mockRejectedValue(error);
    await expect(workStateApi.get()).rejects.toBe(error);
    await expect(workStateApi.update('navigation', {})).rejects.toBe(error);
  });
});
