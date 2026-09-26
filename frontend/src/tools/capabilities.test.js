import { describe, expect, it } from 'vitest';
import { getMissingToolCapabilities, validateToolScopes } from './capabilities';
import { PATHS } from '../routes/paths';

const tool = (id, requiredScopes) => ({ id, requiredScopes });

describe('tool capability presentation', () => {
  it('distinguishes Sheets and creator channel authorization', () => {
    const creator = tool('creator-tools', ['youtube', 'sheets_readonly']);
    expect(getMissingToolCapabilities(creator, {})).toEqual([
      { key: 'youtube-channel', label: 'YouTube 頻道', settingsPath: PATHS.youtubeConnections },
      { key: 'sheets-readonly', label: 'Google 試算表', settingsPath: PATHS.googleSettings },
    ]);
    expect(
      getMissingToolCapabilities(creator, {
        authorizations: { sheets: { connected: true } },
        youtube: { slots: { primary: { authenticated: false } } },
      }).map((capability) => capability.key)
    ).toEqual(['youtube-channel']);
    expect(
      getMissingToolCapabilities(creator, {
        google_scopes: { sheets_readonly: true },
        youtube: { slots: { primary: { authenticated: true } } },
      })
    ).toEqual([]);
  });

  it('uses the dedicated YT Music and uploader grants instead of creator channel access', () => {
    const user = { youtube: { slots: { primary: { authenticated: true } } } };
    expect(getMissingToolCapabilities(tool('youtube-music', ['youtube']), user)[0].settingsPath).toBe(
      PATHS.ytmusicSettings
    );
    expect(getMissingToolCapabilities(tool('weverse-uploader', ['youtube']), user)[0].settingsPath).toBe(
      PATHS.weverseUploader
    );
    expect(
      getMissingToolCapabilities(tool('youtube-music', ['youtube']), {
        authorizations: { ytmusic: { connected: true } },
      })
    ).toEqual([]);
    expect(
      getMissingToolCapabilities(tool('weverse-uploader', ['youtube']), {
        authorizations: { video_uploader: { connected: true } },
      })
    ).toEqual([]);
  });

  it('rejects unknown scope mappings rather than treating them as granted', () => {
    expect(() => validateToolScopes('system-utility', ['youtube'])).toThrow('能力需求不受支援');
    expect(() => validateToolScopes('creator-tools', ['unknown-scope'])).toThrow('能力需求不受支援');
  });
});
