import { describe, expect, it, beforeEach } from 'vitest';
import { buildLoginPath, getSafeReturnPath, PATHS } from './paths';

describe('route paths', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/dashboard');
  });

  it('exposes canonical paths', () => {
    expect(PATHS.youtubeConnections).toBe('/youtube/settings/connections');
    expect(PATHS.sheetSettings).toBe('/sheets/settings');
    expect(PATHS.systemSettings).toBe('/system/settings');
    expect(PATHS.photoCurator).toBe('/photo-curator');
  });

  it('accepts known protected internal paths without hashes', () => {
    expect(getSafeReturnPath('/youtube/drafts/videos')).toBe('/youtube/drafts/videos');
    expect(getSafeReturnPath('/youtube/drafts/shorts?tab=preview')).toBe('/youtube/drafts/shorts?tab=preview');
    expect(getSafeReturnPath('/youtube/drafts/videos#private')).toBeNull();
    expect(buildLoginPath('/youtube/drafts/videos')).toBe('/login?returnTo=%2Fyoutube%2Fdrafts%2Fvideos');
  });

  it.each([
    [PATHS.youtubeSettings, PATHS.youtubeConnections],
    [PATHS.settings, PATHS.googleSettings],
    ['/settings/sheets', PATHS.sheetSettings],
    ['/settings/system', PATHS.systemSettings],
  ])('canonicalizes protected alias %s to %s for auth return paths', (alias, canonicalPath) => {
    expect(getSafeReturnPath(alias)).toBe(canonicalPath);
  });

  it('rejects external, protocol-relative, API, login and unknown paths', () => {
    expect(getSafeReturnPath('https://example.com/dashboard')).toBeNull();
    expect(getSafeReturnPath('//example.com/dashboard')).toBeNull();
    expect(getSafeReturnPath('/api/v1/health')).toBeNull();
    expect(getSafeReturnPath('/login')).toBeNull();
    expect(getSafeReturnPath('/unknown')).toBeNull();
  });
});
