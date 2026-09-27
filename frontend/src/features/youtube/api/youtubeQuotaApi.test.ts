import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../services/api';
import { youtubeQuotaApi } from './youtubeQuotaApi';

vi.mock('../../../services/api', () => ({
  api: { getYoutubeQuotaUsage: vi.fn() },
}));

const usage = () => ({
  slot: 'primary',
  state: 'normal',
  official_default_limit: 10000,
  configured_project_limit: 12000,
  estimated_used_units: 3820,
  estimated_remaining_units: 8180,
  safety_buffer_units: 1000,
  policy_cap_units: 11000,
  effective_available_units: 7180,
  confirmed_by_google: false,
  reset_at: '2026-09-28T00:00:00-07:00',
  reset_timezone: 'America/Los_Angeles',
  methods: [{ method: 'videos.update', calls: 2, cost_per_call: 50, units: 100 }],
  quota_rules_verified_at: '2026-09-01',
  note: 'Toolbox estimate',
  updated_at: null,
});

describe('youtubeQuotaApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a valid quota ledger for the requested slot', async () => {
    vi.mocked(api.getYoutubeQuotaUsage).mockResolvedValue(usage());
    await expect(youtubeQuotaApi.getUsage('primary')).resolves.toEqual(usage());
  });

  it.each([
    { slot: 'secondary' },
    { methods: undefined },
    { estimated_used_units: '3820' },
    { state: 'unknown' },
    { methods: [{ method: 'videos.update', calls: 2, cost_per_call: 50 }] },
  ])('rejects a malformed ledger before rendering it: %j', async (patch) => {
    vi.mocked(api.getYoutubeQuotaUsage).mockResolvedValue({ ...usage(), ...patch } as ReturnType<typeof usage>);
    await expect(youtubeQuotaApi.getUsage('primary')).rejects.toThrow('YouTube 配額回應格式不正確');
  });
});
