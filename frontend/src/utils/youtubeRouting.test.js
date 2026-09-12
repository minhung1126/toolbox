import { describe, expect, it } from 'vitest';
import {
  getYoutubeAuthContext,
  getYoutubeAuthorizationFingerprint,
  YOUTUBE_ROUTING_MODES,
  youtubeIsConnected,
  youtubePreferredUiSlot,
  youtubeRoutingLabel,
  youtubeRoutingMode,
  youtubeRoutingReasonLabel,
} from './youtubeRouting';

describe('YouTube routing helpers', () => {
  it('defaults unknown routing modes to auto-primary', () => {
    expect(youtubeRoutingMode()).toBe(YOUTUBE_ROUTING_MODES.AUTO_PRIMARY);
    expect(youtubeRoutingMode({ routing_mode: 'unsupported' })).toBe(YOUTUBE_ROUTING_MODES.AUTO_PRIMARY);
    expect(youtubeRoutingLabel('unsupported')).toBe('Auto：Primary 優先');
  });

  it('prefers an authenticated primary slot and falls back to secondary', () => {
    expect(youtubePreferredUiSlot({
      active_slot: 'secondary',
      slots: { primary: { authenticated: true }, secondary: { authenticated: true } },
    })).toBe('primary');
    expect(youtubePreferredUiSlot({
      active_slot: 'primary',
      slots: { primary: { authenticated: false }, secondary: { authenticated: true } },
    })).toBe('secondary');
    expect(youtubePreferredUiSlot({ active_slot: 'secondary', slots: {} })).toBe('secondary');
  });

  it('uses only the active slot for manual connectivity', () => {
    const manual = {
      routing_mode: 'manual',
      active_slot: 'primary',
      slots: { primary: { authenticated: false }, secondary: { authenticated: true } },
    };

    expect(youtubeIsConnected(manual)).toBe(false);
    expect(youtubeIsConnected({ ...manual, active_slot: 'secondary' })).toBe(true);
    expect(youtubeIsConnected({ ...manual, routing_mode: 'auto_primary' })).toBe(true);
  });

  it('provides safe routing explanations for known and unknown reasons', () => {
    expect(youtubeRoutingReasonLabel('preview_pinned_slot')).toBe('沿用 preview 已選定的 slot');
    expect(youtubeRoutingReasonLabel('new_reason')).toBe('new_reason');
    expect(youtubeRoutingReasonLabel('')).toBe('尚未取得 routing 原因');
  });

  it('generates consistent authorization fingerprints and auth context', () => {
    const youtube = {
      active_slot: 'primary',
      routing_mode: 'auto_primary',
      slots: {
        primary: {
          configured: true,
          authenticated: true,
          channel_id: 'UC123',
          channel_title: 'My Channel',
          client_fingerprint: 'fp123',
          token_status: 'active',
          token_expires_at: '2026-09-12T12:00:00Z',
          last_refreshed_at: '2026-09-12T11:00:00Z',
          user: { sub: 'sub-1', email: 'user@example.com' },
        },
      },
    };

    const fingerprint = getYoutubeAuthorizationFingerprint(youtube);
    expect(JSON.parse(fingerprint)).toEqual({
      activeSlot: 'primary',
      routingMode: 'auto_primary',
      slots: [
        ['primary', true, true, 'UC123', 'fp123', 'active', '2026-09-12T12:00:00Z', '2026-09-12T11:00:00Z'],
        ['secondary', null, null, null, null, null, null, null],
      ],
    });

    const context = getYoutubeAuthContext({ youtube });
    expect(context.slot).toBe('primary');
    expect(context.channelId).toBe('UC123');
    expect(context.channelTitle).toBe('My Channel');
    expect(context.account).toBe('sub-1');
    expect(context.authenticated).toBe(true);
    expect(context.authorizationFingerprint).toBe(fingerprint);
  });
});
