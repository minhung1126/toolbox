import { describe, expect, it } from 'vitest';
import {
  getAllTools,
  getDashboardFeatureCards,
  getFeatureRoutes,
  getSystemNavItems,
  getToolById,
  getToolNavGroups,
  validateFeatureManifests,
} from './catalog';
import { PATHS } from '../routes/paths';

function expectUniqueIds(items) {
  const ids = items.map((item) => item.id);
  expect(new Set(ids).size).toBe(ids.length);
}

describe('Toolbox Frontend Tool Catalog', () => {
  it('returns registered tools with metadata', () => {
    const tools = getAllTools();
    const ids = tools.map((t) => t.id);
    expect(ids).toContain('creator-tools');
    expect(ids).toContain('youtube-music');
    expect(ids).toContain('sheets-tools');
    expect(ids).toContain('sticky-notes');
    expect(ids).toContain('photo-curator');
    expect(ids).toContain('ffmpeg-generator');
    expect(ids).toContain('weverse-uploader');
    expect(ids).toContain('youtube-integrations');
    expect(ids).toContain('system-utility');
  });

  it('keeps tool, navigation, card identifiers and destinations consistent', () => {
    const tools = getAllTools();
    const groups = getToolNavGroups();
    const navItems = groups.flatMap((group) => group.items || []);
    const cards = getDashboardFeatureCards();
    const knownPaths = new Set(Object.values(PATHS));

    expectUniqueIds(tools);
    expectUniqueIds(groups);
    expectUniqueIds(navItems);
    expectUniqueIds(cards);

    for (const path of [
      ...tools.map((tool) => tool.entryUrl),
      ...navItems.map((item) => item.to),
      ...cards.map((card) => card.to),
    ]) {
      expect(knownPaths.has(path), `Unknown catalog destination: ${path}`).toBe(true);
    }
  });

  it('rejects duplicate feature IDs and routes outside the route registry', () => {
    const tools = getAllTools();
    expect(() => validateFeatureManifests([tools[0], tools[0]])).toThrow('Duplicate feature id');
    expect(() => validateFeatureManifests([{ ...tools[0], entryUrl: '/missing-route' }])).toThrow(
      'unknown route: /missing-route'
    );
    expect(() => validateFeatureManifests([{ ...tools[0], routes: [...tools[0].routes, tools[0].routes[0]] }])).toThrow(
      'Duplicate feature route'
    );
  });

  it('aggregates unique routes from each feature manifest', () => {
    const routes = getFeatureRoutes();
    expect(routes.map((route) => route.path)).toContain('youtube/drafts/videos');
    expect(routes.map((route) => route.path)).toContain('ytmusic/playlist-sort');
    expect(routes.map((route) => route.path)).toContain('youtube/settings/*');
    expect(new Set(routes.map((route) => route.path)).size).toBe(routes.length);
  });

  it('finds tool by id', () => {
    const tool = getToolById('creator-tools');
    expect(tool).not.toBeNull();
    expect(tool.name).toBe('Creator Tools');
    expect(tool.navGroups.length).toBeGreaterThan(0);

    const ytmusicTool = getToolById('youtube-music');
    expect(ytmusicTool).not.toBeNull();
    expect(ytmusicTool.name).toBe('YouTube Music');
    expect(ytmusicTool.navGroups.length).toBeGreaterThan(0);
    const ytmusicItemIds = ytmusicTool.navGroups[0].items.map((i) => i.id);
    expect(ytmusicItemIds).toContain('ytmusic_playlist_sort');
    expect(ytmusicItemIds).toContain('ytmusic_settings');

    const sheetsTool = getToolById('sheets-tools');
    expect(sheetsTool).not.toBeNull();
    expect(sheetsTool.name).toBe('Sheets & Data');

    const integrationsTool = getToolById('youtube-integrations');
    expect(integrationsTool).not.toBeNull();
    expect(integrationsTool.name).toBe('Integrations & Quota');

    const notesTool = getToolById('sticky-notes');
    expect(notesTool).not.toBeNull();
    expect(notesTool.name).toBe('Sticky Notes');

    const photoCuratorTool = getToolById('photo-curator');
    expect(photoCuratorTool).not.toBeNull();
    expect(photoCuratorTool.name).toBe('Photo Curator');

    const ffmpegTool = getToolById('ffmpeg-generator');
    expect(ffmpegTool).not.toBeNull();
    expect(ffmpegTool.name).toBe('FFmpeg Generator');

    const weverseTool = getToolById('weverse-uploader');
    expect(weverseTool).not.toBeNull();
    expect(weverseTool.name).toBe('Weverse Uploader');
    expect(weverseTool.title).toBe('Weverse 影片上傳');
  });

  it('aggregates navigation groups and system items', () => {
    const navGroups = getToolNavGroups();
    const groupIds = navGroups.map((g) => g.id);
    expect(groupIds).toContain('youtube');
    expect(groupIds).toContain('ytmusic');
    expect(groupIds).toContain('sheet');
    expect(groupIds).toContain('system');
    expect(groupIds).toContain('notes');
    expect(groupIds).toContain('photo_curator_nav');
    expect(groupIds).toContain('ffmpeg_nav');
    expect(groupIds).toContain('weverse_uploader_nav');
    expect(groupIds).toContain('integrations');

    const systemItems = getSystemNavItems();
    const itemIds = systemItems.map((i) => i.id);
    expect(itemIds).toContain('api_health');
    expect(itemIds).toContain('system_info');
    expect(itemIds).toContain('system_settings');
  });

  it('provides dashboard feature cards', () => {
    const cards = getDashboardFeatureCards();
    expect(cards.length).toBeGreaterThanOrEqual(8);
    const cardIds = cards.map((c) => c.id);
    expect(cardIds).toContain('video_drafts');
    expect(cardIds).toContain('shorts_drafts');
    expect(cardIds).toContain('publish_clean');
    expect(cardIds).toContain('ytmusic_playlist_sort_card');
    expect(cardIds).toContain('ytmusic_settings_card');
    expect(cardIds).toContain('sheet_copy');
    expect(cardIds).toContain('youtube_connections_card');
    expect(cardIds).toContain('system_settings_card');
    expect(cardIds).toContain('sticky_notes_card');
    expect(cardIds).toContain('photo_curator_card');
    expect(cardIds).toContain('weverse_uploader_card');
  });
});
