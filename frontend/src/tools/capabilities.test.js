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

  it('does not present a mismatched YouTube channel as a usable capability', () => {
    const user = {
      youtube: {
        routing_mode: 'auto_primary',
        slots: {
          primary: { authenticated: true, can_be_active: false, channel_mismatch: true },
          secondary: { authenticated: true, can_be_active: false, channel_mismatch: true },
        },
      },
    };
    expect(getMissingToolCapabilities(tool('creator-tools', ['youtube']), user)[0].settingsPath).toBe(
      PATHS.youtubeConnections
    );
    expect(getMissingToolCapabilities(tool('youtube-music', ['youtube']), user)[0].settingsPath).toBe(
      PATHS.ytmusicSettings
    );
  });

  it('honors YT Music channel fallback but keeps uploader authorization independent', () => {
    const user = { youtube: { slots: { primary: { authenticated: true } } } };
    expect(getMissingToolCapabilities(tool('youtube-music', ['youtube']), user)).toEqual([]);
    expect(getMissingToolCapabilities(tool('weverse-uploader', ['youtube']), user)[0].settingsPath).toBe(
      PATHS.weverseUploader
    );
    expect(getMissingToolCapabilities(tool('youtube-music', ['youtube']), {})[0].settingsPath).toBe(
      PATHS.ytmusicSettings
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

  it('uses each route capability override, including an intentionally empty requirement', () => {
    const creator = {
      ...tool('creator-tools', ['youtube', 'sheets_readonly']),
      routeScopes: { [PATHS.youtubePublishCleanup]: ['youtube'] },
    };
    const channelOnly = { youtube: { slots: { primary: { authenticated: true } } } };
    expect(getMissingToolCapabilities(creator, channelOnly, PATHS.youtubeVideoDrafts)).toHaveLength(1);
    expect(getMissingToolCapabilities(creator, channelOnly, PATHS.youtubePublishCleanup)).toEqual([]);
    expect(
      getMissingToolCapabilities(
        { ...tool('youtube-music', ['youtube']), routeScopes: { [PATHS.ytmusicSettings]: [] } },
        {},
        PATHS.ytmusicSettings
      )
    ).toEqual([]);
  });
});
