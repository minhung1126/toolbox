import { youtubeIsConnected } from '../features/youtube/model/routing';
import { PATHS } from '../routes/paths';

const YOUTUBE_CHANNEL_REQUIREMENT = Object.freeze({
  key: 'youtube-channel',
  label: 'YouTube 頻道',
  settingsPath: PATHS.youtubeConnections,
  connected: (authUser) => youtubeIsConnected(authUser?.youtube),
});

const YOUTUBE_MUSIC_REQUIREMENT = Object.freeze({
  key: 'youtube-music',
  label: 'YouTube Music',
  settingsPath: PATHS.ytmusicSettings,
  connected: (authUser) =>
    Boolean(authUser?.authorizations?.ytmusic?.connected) || youtubeIsConnected(authUser?.youtube),
});

const SHEETS_REQUIREMENT = Object.freeze({
  key: 'sheets-readonly',
  label: 'Google 試算表',
  settingsPath: PATHS.googleSettings,
  connected: (authUser) =>
    Boolean(authUser?.authorizations?.sheets?.connected || authUser?.google_scopes?.sheets_readonly),
});

function requirementFor(toolId, scope) {
  if (scope === 'sheets_readonly') return SHEETS_REQUIREMENT;
  if (scope === 'youtube') {
    return toolId === 'youtube-music' ? YOUTUBE_MUSIC_REQUIREMENT : YOUTUBE_CHANNEL_REQUIREMENT;
  }
  return null;
}

export function validateToolScopes(toolId, scopes) {
  if (!Array.isArray(scopes) || scopes.some((scope) => !requirementFor(toolId, scope))) {
    throw new Error(`工具 ${toolId} 的能力需求不受支援。`);
  }
}

export function getMissingToolCapabilities(tool, authUser, routePath) {
  const scopes = (routePath && tool.routeScopes?.[routePath]) ?? tool.requiredScopes ?? [];
  validateToolScopes(tool.id, scopes);
  return scopes.flatMap((scope) => {
    const requirement = requirementFor(tool.id, scope);
    return requirement.connected(authUser)
      ? []
      : [{ key: requirement.key, label: requirement.label, settingsPath: requirement.settingsPath }];
  });
}
