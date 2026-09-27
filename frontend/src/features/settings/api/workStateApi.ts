import { api } from '../../../services/api';
import type { AccountWorkStateResponse, WorkStateValue } from './workStateTypes';

export type * from './workStateTypes';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function containsSubmittedValue(received: unknown, submitted: unknown): boolean {
  if (Array.isArray(submitted)) {
    return (
      Array.isArray(received) &&
      received.length === submitted.length &&
      submitted.every((item, index) => containsSubmittedValue(received[index], item))
    );
  }
  if (isRecord(submitted)) {
    return (
      isRecord(received) &&
      Object.entries(submitted).every(
        ([key, value]) => Object.hasOwn(received, key) && containsSubmittedValue(received[key], value)
      )
    );
  }
  return Object.is(received, submitted);
}

function parseWorkState(value: unknown): AccountWorkStateResponse {
  if (
    !isRecord(value) ||
    (value.version !== undefined && value.version !== 1) ||
    !isRecord(value.state) ||
    !Object.values(value.state).every(isRecord)
  ) {
    throw new Error('帳號工作狀態回應格式不正確。');
  }
  return value as unknown as AccountWorkStateResponse;
}

export const workStateApi = {
  async get(): Promise<AccountWorkStateResponse> {
    const response: unknown = await api.getWorkState();
    return parseWorkState(response);
  },

  async update(key: string, value: WorkStateValue): Promise<AccountWorkStateResponse> {
    const response: unknown = await api.updateWorkState(key, value);
    const parsed = parseWorkState(response);
    if (!Object.hasOwn(parsed.state, key) || !containsSubmittedValue(parsed.state[key], value)) {
      throw new Error('帳號工作狀態寫入結果不一致，請重新整理核對。');
    }
    return parsed;
  },
};
