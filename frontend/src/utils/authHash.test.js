import { clearAuthHash, parseAuthHash, sanitizeAuthHashMessage } from './authHash';

describe('OAuth callback hash parsing', () => {
  it('uses exact Google callback keys', () => {
    expect(parseAuthHash('#auth_success=1')).toEqual({ type: 'google_success', value: '1' });
    expect(parseAuthHash('#auth_error=safe')).toEqual({ type: 'google_error', value: 'safe' });
    expect(parseAuthHash('#sheets_auth_success=1')).toEqual({ type: 'sheets_success', value: '1' });
    expect(parseAuthHash('#sheets_auth_error=denied')).toEqual({ type: 'sheets_error', value: 'denied' });
    expect(parseAuthHash('#drive_auth_success=1')).toBeNull();
    expect(parseAuthHash('#drive_auth_error=denied')).toBeNull();
    expect(parseAuthHash('#ytmusic_auth_success=1')).toEqual({ type: 'ytmusic_success', value: '1' });
    expect(parseAuthHash('#ytmusic_auth_error=denied')).toEqual({ type: 'ytmusic_error', value: 'denied' });
    expect(parseAuthHash('#not_auth_success=1')).toBeNull();
  });

  it('clears the hash without navigating or replaying the callback', () => {
    window.history.replaceState({}, '', '/settings?tab=google#auth_success=1');
    clearAuthHash();
    expect(window.location.pathname).toBe('/settings');
    expect(window.location.search).toBe('?tab=google');
    expect(window.location.hash).toBe('');
  });

  it('sanitizes OAuth hash error messages and rejects HTML or URL payloads', () => {
    expect(sanitizeAuthHashMessage('  此 Google 帳號未列入系統允許名單，無法登入。\n', 'fallback')).toBe(
      '此 Google 帳號未列入系統允許名單，無法登入。'
    );
    expect(sanitizeAuthHashMessage('Invalid OAuth state', 'fallback')).toBe('Invalid OAuth state');
    expect(sanitizeAuthHashMessage('', 'fallback')).toBe('fallback');
    expect(sanitizeAuthHashMessage('<script>alert(1)</script>', 'fallback')).toBe('fallback');
    expect(sanitizeAuthHashMessage('Visit https://evil.example/phish', 'fallback')).toBe('fallback');
    expect(sanitizeAuthHashMessage('javascript:alert(1)', 'fallback')).toBe('fallback');
    expect(sanitizeAuthHashMessage('a'.repeat(250), 'fallback')).toHaveLength(200);
  });
});
