import { describe, expect, it } from 'vitest';
import {
  GENERIC_ARTIST_NAMES,
  NON_ALBUM_NAMES,
  SORT_FIELDS,
  SORT_PRESETS,
  buildAlbumContextMap,
  buildPreviewFromSorted,
  formatDuration,
  getEffectiveSortArtist,
  getFirstArtist,
  getLocaleCollation,
  isGenericArtist,
  isRealAlbum,
  normalizeArtistName,
  sortTracksLocally,
  splitArtists,
} from './playlistSort';

describe('playlistSort utils', () => {
  describe('getLocaleCollation', () => {
    it('normalizes locale tags correctly', () => {
      expect(getLocaleCollation('zh_TW')).toBe('zh-Hant-TW');
      expect(getLocaleCollation('zh-hant')).toBe('zh-Hant-TW');
      expect(getLocaleCollation('tw')).toBe('zh-Hant-TW');
      expect(getLocaleCollation('zh_CN')).toBe('zh-Hans-CN');
      expect(getLocaleCollation('ja_JP')).toBe('ja-JP');
      expect(getLocaleCollation('ko_KR')).toBe('ko-KR');
      expect(getLocaleCollation('en_US')).toBe('en-US');
      expect(getLocaleCollation('')).toBe('zh-Hant-TW');
      expect(getLocaleCollation(null)).toBe('zh-Hant-TW');
    });
  });

  describe('normalizeArtistName', () => {
    it('strips - Topic and (主題) suffixes', () => {
      expect(normalizeArtistName('周杰倫 - Topic')).toBe('周杰倫');
      expect(normalizeArtistName('A-Lin (主題)')).toBe('A-Lin');
      expect(normalizeArtistName('Various Artists - 主題')).toBe('Various Artists');
      expect(normalizeArtistName('')).toBe('');
      expect(normalizeArtistName(null)).toBe('');
    });

    it('cleans multi-artist comma lists', () => {
      expect(normalizeArtistName('林俊傑, 蔡依林 - Topic')).toBe('林俊傑, 蔡依林');
    });
  });

  describe('isGenericArtist & isRealAlbum', () => {
    it('identifies generic compilation/soundtrack artist names', () => {
      expect(isGenericArtist('Various Artists')).toBe(true);
      expect(isGenericArtist('群星')).toBe(true);
      expect(isGenericArtist('合輯')).toBe(true);
      expect(isGenericArtist('OST')).toBe(true);
      expect(isGenericArtist('周杰倫')).toBe(false);
      expect(isGenericArtist('')).toBe(false);
    });

    it('identifies singles and video placeholders as non-album', () => {
      expect(isRealAlbum('單曲')).toBe(false);
      expect(isRealAlbum('Single')).toBe(false);
      expect(isRealAlbum('影片')).toBe(false);
      expect(isRealAlbum('video')).toBe(false);
      expect(isRealAlbum('魔杰座')).toBe(true);
      expect(isRealAlbum('')).toBe(false);
    });
  });

  describe('splitArtists & getFirstArtist', () => {
    it('splits collaboration strings and featuring tags', () => {
      expect(splitArtists('周杰倫 feat. 溫嵐')).toEqual(['周杰倫', '溫嵐']);
      expect(splitArtists('Jay Chou & Jolin Tsai')).toEqual(['Jay Chou', 'Jolin Tsai']);
      expect(splitArtists('Artist A / Artist B、Artist C')).toEqual(['Artist A', 'Artist B', 'Artist C']);
      expect(splitArtists('')).toEqual([]);
    });

    it('extracts the first artist cleanly', () => {
      expect(getFirstArtist('周杰倫 feat. 溫嵐')).toBe('周杰倫');
      expect(getFirstArtist('')).toBe('');
    });
  });

  describe('buildAlbumContextMap & getEffectiveSortArtist', () => {
    it('determines dominant artist and compilation context', () => {
      const tracks = [
        { album: '精選集', artist: '群星', track_number: 1 },
        { album: '精選集', artist: '歌手 A', track_number: 2 },
        { album: '精選集', artist: '歌手 B', track_number: 3 },
      ];
      const context = buildAlbumContextMap(tracks);
      expect(context['精選集']).toBeDefined();
      expect(context['精選集'].isCompilation).toBe(true);

      const effectiveArtist = getEffectiveSortArtist(tracks[0], context);
      expect(effectiveArtist).toBe('Various Artists');
    });
  });

  describe('sortTracksLocally', () => {
    it('sorts tracks by title ascending and descending', () => {
      const items = [
        { playlist_item_id: '1', title: 'C Song' },
        { playlist_item_id: '2', title: 'A Song' },
        { playlist_item_id: '3', title: 'B Song' },
      ];

      const asc = sortTracksLocally(items, [{ field: 'title', direction: 'asc' }]);
      expect(asc.map((x) => x.title)).toEqual(['A Song', 'B Song', 'C Song']);

      const desc = sortTracksLocally(items, [{ field: 'title', direction: 'desc' }]);
      expect(desc.map((x) => x.title)).toEqual(['C Song', 'B Song', 'A Song']);
    });

    it('sorts tracks by track_number within album', () => {
      const items = [
        { playlist_item_id: '1', album: 'Album A', track_number: 3, release_date: '2020-01-01' },
        { playlist_item_id: '2', album: 'Album A', track_number: 1, release_date: '2020-01-01' },
        { playlist_item_id: '3', album: 'Album A', track_number: 2, release_date: '2020-01-01' },
      ];
      const sorted = sortTracksLocally(items, [{ field: 'track_number', direction: 'asc' }]);
      expect(sorted.map((x) => x.track_number)).toEqual([1, 2, 3]);
    });
  });

  describe('buildPreviewFromSorted', () => {
    it('calculates moved and unchanged counts accurately', () => {
      const original = [
        { playlist_item_id: '1', title: 'A' },
        { playlist_item_id: '2', title: 'B' },
        { playlist_item_id: '3', title: 'C' },
      ];
      const sorted = [
        { playlist_item_id: '2', title: 'B' },
        { playlist_item_id: '1', title: 'A' },
        { playlist_item_id: '3', title: 'C' },
      ];
      const preview = buildPreviewFromSorted(original, sorted);
      expect(preview.total).toBe(3);
      expect(preview.unchanged_count).toBe(1); // item '3' remains at index 2
      expect(preview.moved_count).toBe(2); // items '1' and '2' swapped
      expect(preview.items[2].status).toBe('unchanged');
      expect(preview.items[0].status).toBe('moved');
    });
  });

  describe('formatDuration', () => {
    it('formats seconds into mm:ss or hh:mm:ss', () => {
      expect(formatDuration(65)).toBe('1:05');
      expect(formatDuration(3665)).toBe('1:01:05');
      expect(formatDuration(0)).toBe('0:00');
      expect(formatDuration(null)).toBe('--:--');
      expect(formatDuration(-10)).toBe('--:--');
    });
  });

  describe('constants export check', () => {
    it('exports predefined presets and fields', () => {
      expect(SORT_PRESETS.length).toBeGreaterThan(5);
      expect(SORT_FIELDS.some((f) => f.value === 'artist')).toBe(true);
      expect(GENERIC_ARTIST_NAMES.has('soundtrack')).toBe(true);
      expect(NON_ALBUM_NAMES.has('single')).toBe(true);
    });
  });
});
