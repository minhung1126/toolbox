import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../services/api';
import { AuthContractError, authApi } from './authApi';

vi.mock('../../../services/api', () => ({
  api: {
    getAuthConfig: vi.fn(),
    getAuthUrl: vi.fn(),
    getSetupStatus: vi.fn(),
    performSetup: vi.fn(),
  },
}));

describe('authApi response contracts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts the declared login and setup read responses', async () => {
    vi.mocked(api.getAuthConfig).mockResolvedValueOnce({ has_client_id: true, has_client_secret: true });
    vi.mocked(api.getAuthUrl).mockResolvedValueOnce({ auth_url: 'https://accounts.google.com/o/oauth2/auth' });
    vi.mocked(api.getSetupStatus).mockResolvedValueOnce({
      is_configured: false,
      setup_completed: false,
      needs_pin: true,
      redirect_uri: 'https://example.test/api/v1/auth/callback',
    });

    await expect(authApi.getLoginConfig()).resolves.toMatchObject({ has_client_id: true });
    await expect(authApi.getLoginUrl()).resolves.toMatchObject({
      auth_url: expect.stringContaining('accounts.google.com'),
    });
    await expect(authApi.getSetupStatus()).resolves.toMatchObject({ needs_pin: true });
  });

  it('rejects malformed and off-domain login responses', async () => {
    vi.mocked(api.getAuthConfig).mockResolvedValueOnce({});
    vi.mocked(api.getAuthUrl).mockResolvedValueOnce({ auth_url: 'https://example.test/login' });
    await expect(authApi.getLoginConfig()).rejects.toBeInstanceOf(AuthContractError);
    await expect(authApi.getLoginUrl()).rejects.toBeInstanceOf(AuthContractError);
  });

  it('does not report setup success when its confirmation is missing', async () => {
    const request = { googleClientId: 'client', googleClientSecret: 'secret', adminEmail: 'admin@example.test' };
    vi.mocked(api.performSetup).mockResolvedValueOnce({});
    await expect(authApi.performSetup(request)).rejects.toBeInstanceOf(AuthContractError);
    vi.mocked(api.performSetup).mockResolvedValueOnce({
      status: 'success',
      message: '完成',
      admin_email: request.adminEmail,
    });
    await expect(authApi.performSetup(request)).resolves.toMatchObject({ status: 'success' });
  });

  it('normalizes the administrator email before submitting and confirming setup', async () => {
    const request = { googleClientId: 'client', googleClientSecret: 'secret', adminEmail: ' Admin@Example.test ' };
    vi.mocked(api.performSetup).mockResolvedValueOnce({
      status: 'success',
      message: '完成',
      admin_email: 'admin@example.test',
    });

    await expect(authApi.performSetup(request)).resolves.toMatchObject({ status: 'success' });
    expect(api.performSetup).toHaveBeenCalledWith({ ...request, adminEmail: 'admin@example.test' });

    vi.mocked(api.performSetup).mockResolvedValueOnce({
      status: 'success',
      message: '完成',
      admin_email: 'other@example.test',
    });
    await expect(authApi.performSetup(request)).rejects.toBeInstanceOf(AuthContractError);
  });
});
