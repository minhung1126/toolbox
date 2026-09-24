import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../services/api';
import { systemSettingsApi } from './systemSettingsApi';

vi.mock('../../../services/api', () => ({
  api: {
    getSystemCredentials: vi.fn(),
    updateSystemCredentials: vi.fn(),
    getAllowlist: vi.fn(),
    addAllowlistEmail: vi.fn(),
    removeAllowlistEmail: vi.fn(),
    updateAllowNewUsers: vi.fn(),
  },
}));

describe('systemSettingsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards credential reads and updates through the typed system API', async () => {
    const credentials = { status: 'success', credentials: {}, public_base_url: '', redirect_uri: '' };
    vi.mocked(api.getSystemCredentials).mockResolvedValueOnce(credentials);
    vi.mocked(api.updateSystemCredentials).mockResolvedValueOnce(credentials);

    await expect(systemSettingsApi.getCredentials()).resolves.toBe(credentials);
    const request = { google_client_id: 'client-id', google_client_secret: 'client-secret' };
    await expect(systemSettingsApi.updateCredentials(request)).resolves.toBe(credentials);

    expect(api.getSystemCredentials).toHaveBeenCalledOnce();
    expect(api.updateSystemCredentials).toHaveBeenCalledWith(request);
  });

  it('forwards allowlist and account policy operations without changing their response shapes', async () => {
    const allowlist = {
      allowed_emails: ['admin@example.test'],
      current_user_email: 'admin@example.test',
      allowlist_required: true,
      allow_new_users: true,
    };
    const mutation = { status: 'success', ...allowlist };
    const policy = { status: 'success', allow_new_users: false, message: 'updated' };
    vi.mocked(api.getAllowlist).mockResolvedValueOnce(allowlist);
    vi.mocked(api.addAllowlistEmail).mockResolvedValueOnce(mutation);
    vi.mocked(api.removeAllowlistEmail).mockResolvedValueOnce(mutation);
    vi.mocked(api.updateAllowNewUsers).mockResolvedValueOnce(policy);

    await expect(systemSettingsApi.getAllowlist()).resolves.toBe(allowlist);
    await expect(systemSettingsApi.addAllowlistEmail('admin@example.test')).resolves.toBe(mutation);
    await expect(systemSettingsApi.removeAllowlistEmail('admin@example.test')).resolves.toBe(mutation);
    await expect(systemSettingsApi.updateAllowNewUsers(false)).resolves.toBe(policy);

    expect(api.getAllowlist).toHaveBeenCalledOnce();
    expect(api.addAllowlistEmail).toHaveBeenCalledWith('admin@example.test');
    expect(api.removeAllowlistEmail).toHaveBeenCalledWith('admin@example.test');
    expect(api.updateAllowNewUsers).toHaveBeenCalledWith(false);
  });
});
