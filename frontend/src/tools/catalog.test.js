import { describe, expect, it } from 'vitest';
import {
  getAllTools,
  getDashboardFeatureCards,
  getSystemNavItems,
  getToolById,
  getToolNavGroups,
} from './catalog';

describe('Toolbox Frontend Tool Catalog', () => {
  it('returns registered tools with metadata', () => {
    const tools = getAllTools();
    expect(tools.length).toBe(8);
    const ids = tools.map((t) => t.id);
    expect(ids).toContain('creator-tools');
    expect(ids).toContain('youtube-music');
    expect(ids).toContain('sheets-tools');
    expect(ids).toContain('sticky-notes');
    expect(ids).toContain('photo-curator');
    expect(ids).toContain('ffmpeg-generator');
    expect(ids).toContain('integrations-quota');
    expect(ids).toContain('system-utility');
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

    const integrationsTool = getToolById('integrations-quota');
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
    expect(groupIds).toContain('integrations');

    const systemItems = getSystemNavItems();
    const itemIds = systemItems.map((i) => i.id);
    expect(itemIds).toContain('api_health');
    expect(itemIds).toContain('system_info');
    expect(itemIds).toContain('system_settings');
  });

  it('provides dashboard feature cards', () => {
    const cards = getDashboardFeatureCards();
    expect(cards.length).toBeGreaterThanOrEqual(7);
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
  });
});

