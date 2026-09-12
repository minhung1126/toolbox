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
    expect(tools.length).toBeGreaterThanOrEqual(2);
    const ids = tools.map((t) => t.id);
    expect(ids).toContain('creator-tools');
    expect(ids).toContain('system-utility');
    expect(ids).toContain('sticky-notes');
  });

  it('finds tool by id', () => {
    const tool = getToolById('creator-tools');
    expect(tool).not.toBeNull();
    expect(tool.name).toBe('Creator Tools');
    expect(tool.navGroups.length).toBeGreaterThan(0);

    const notesTool = getToolById('sticky-notes');
    expect(notesTool).not.toBeNull();
    expect(notesTool.name).toBe('Sticky Notes');
  });

  it('aggregates navigation groups and system items', () => {
    const navGroups = getToolNavGroups();
    const groupIds = navGroups.map((g) => g.id);
    expect(groupIds).toContain('youtube');
    expect(groupIds).toContain('sheet');
    expect(groupIds).toContain('system');
    expect(groupIds).toContain('notes');

    const systemItems = getSystemNavItems();
    const itemIds = systemItems.map((i) => i.id);
    expect(itemIds).toContain('api_health');
    expect(itemIds).toContain('system_info');
    expect(itemIds).toContain('system_settings');
  });

  it('provides dashboard feature cards', () => {
    const cards = getDashboardFeatureCards();
    expect(cards.length).toBeGreaterThanOrEqual(4);
    const cardIds = cards.map((c) => c.id);
    expect(cardIds).toContain('video_drafts');
    expect(cardIds).toContain('shorts_drafts');
    expect(cardIds).toContain('publish_clean');
    expect(cardIds).toContain('system_settings_card');
    expect(cardIds).toContain('sticky_notes_card');
  });
});

