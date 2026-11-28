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
import type { PlaylistSortTrack } from './types';

describe('playlist sort feature model', () => {
  it('handles missing tracks and returns copied positions without a sorting rule', () => {
    expect(sortTracksLocally(null, [])).toEqual([]);
    expect(sortTracksLocally(undefined, null)).toEqual([]);
    const track = Object.freeze({ playlist_item_id: 'a', new_position: 9 });
    const tracks = Object.freeze([track]);
    expect(sortTracksLocally(tracks, [])).toEqual([{ playlist_item_id: 'a', new_position: 0 }]);
    expect(track.new_position).toBe(9);
  });

  it('preserves stable multi-key sorting and leaves the provider tracks untouched', () => {
    const tracks = Object.freeze([
      Object.freeze({ playlist_item_id: 'a', title: 'Track 10', artist: 'Artist B' }),
      Object.freeze({ playlist_item_id: 'b', title: 'Track 10', artist: 'Artist A' }),
      Object.freeze({ playlist_item_id: 'c', title: 'Track 2', artist: 'Artist A' }),
      Object.freeze({ playlist_item_id: 'd', title: 'Track 2', artist: 'Artist A' }),
    ]);
    const result = sortTracksLocally(
      tracks,
      [
        { field: 'artist', direction: 'asc' },
        { field: 'title', direction: 'asc' },
      ],
      'en-US'
    );
    expect(result.map((track) => track.playlist_item_id)).toEqual(['c', 'd', 'b', 'a']);
    expect(result.map((track) => track.new_position)).toEqual([0, 1, 2, 3]);
    expect(tracks[0]).not.toHaveProperty('new_position');
  });

  it('uses album context dates while keeping unknown dates last in both directions', () => {
    const tracks: PlaylistSortTrack[] = [
      { playlist_item_id: 'a', album: 'Album A', artist: 'Singer' },
      { playlist_item_id: 'b', album: 'Album A', artist: 'Singer', release_date: '2020-01-01' },
      { playlist_item_id: 'c', album: 'Single', release_date: '2021-01-01' },
      { playlist_item_id: 'd' },
    ];
    expect(
      sortTracksLocally(tracks, [{ field: 'year', direction: 'desc' }]).map((track) => track.playlist_item_id)
    ).toEqual(['c', 'a', 'b', 'd']);
    expect(
      sortTracksLocally(tracks, [{ field: 'year', direction: 'asc' }]).map((track) => track.playlist_item_id)
    ).toEqual(['a', 'b', 'c', 'd']);
  });

  it('treats object prototype names as ordinary album and artist metadata', () => {
    const tracks = [{ playlist_item_id: 'a', album: '__proto__', artist: '__proto__', year: 2024 }];
    const context = buildAlbumContextMap(tracks);
    expect(context.__proto__).toEqual({
      primaryArtist: '__proto__',
      isCompilation: false,
      year: 2024,
      releaseDate: null,
    });
    expect(sortTracksLocally(tracks, [{ field: 'album', direction: 'asc' }])[0].playlist_item_id).toBe('a');
  });

  it('calculates manual reorder counts against provider positions, including prototype-like IDs', () => {
    const original = [
      { playlist_item_id: '__proto__', original_position: 0 },
      { playlist_item_id: 'b', original_position: 1 },
      { playlist_item_id: 'c', original_position: 2 },
    ];
    const preview = buildPreviewFromSorted(original, [original[1], original[0], original[2]]);
    expect(preview).toMatchObject({ total: 3, moved_count: 2, unchanged_count: 1 });
    expect(preview.items.map((item) => [item.original_position, item.new_position, item.status])).toEqual([
      [1, 0, 'moved'],
      [0, 1, 'moved'],
      [2, 2, 'unchanged'],
    ]);
  });

  it('normalizes locale collation tags', () => {
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

  it('normalizes artist names and cleans multi-artist comma lists', () => {
    expect(normalizeArtistName('周杰倫 - Topic')).toBe('周杰倫');
    expect(normalizeArtistName('A-Lin (主題)')).toBe('A-Lin');
    expect(normalizeArtistName('Various Artists - 主題')).toBe('Various Artists');
    expect(normalizeArtistName('')).toBe('');
    expect(normalizeArtistName(null)).toBe('');
    expect(normalizeArtistName('林俊傑, 蔡依林 - Topic')).toBe('林俊傑, 蔡依林');
  });

  it('identifies generic artist names and non-album placeholders', () => {
    expect(isGenericArtist('Various Artists')).toBe(true);
    expect(isGenericArtist('群星')).toBe(true);
    expect(isGenericArtist('合輯')).toBe(true);
    expect(isGenericArtist('OST')).toBe(true);
    expect(isGenericArtist('周杰倫')).toBe(false);
    expect(isGenericArtist('')).toBe(false);

    expect(isRealAlbum('單曲')).toBe(false);
    expect(isRealAlbum('Single')).toBe(false);
    expect(isRealAlbum('影片')).toBe(false);
    expect(isRealAlbum('video')).toBe(false);
    expect(isRealAlbum('魔杰座')).toBe(true);
    expect(isRealAlbum('')).toBe(false);
  });

  it('splits collaboration artists and extracts the first artist', () => {
    expect(splitArtists('周杰倫 feat. 溫嵐')).toEqual(['周杰倫', '溫嵐']);
    expect(splitArtists('Jay Chou & Jolin Tsai')).toEqual(['Jay Chou', 'Jolin Tsai']);
    expect(splitArtists('Artist A / Artist B、Artist C')).toEqual(['Artist A', 'Artist B', 'Artist C']);
    expect(splitArtists('')).toEqual([]);
    expect(getFirstArtist('周杰倫 feat. 溫嵐')).toBe('周杰倫');
    expect(getFirstArtist('')).toBe('');
  });

  it('determines compilation context and effective sort artist', () => {
    const tracks: PlaylistSortTrack[] = [
      { playlist_item_id: '1', album: '精選集', artist: '群星', track_number: 1 },
      { playlist_item_id: '2', album: '精選集', artist: '歌手 A', track_number: 2 },
      { playlist_item_id: '3', album: '精選集', artist: '歌手 B', track_number: 3 },
    ];
    const context = buildAlbumContextMap(tracks);
    expect(context['精選集']).toBeDefined();
    expect(context['精選集'].isCompilation).toBe(true);
    expect(getEffectiveSortArtist(tracks[0], context)).toBe('Various Artists');
  });

  it('sorts tracks by title asc/desc and track_number within album', () => {
    const items: PlaylistSortTrack[] = [
      { playlist_item_id: '1', title: 'C Song' },
      { playlist_item_id: '2', title: 'A Song' },
      { playlist_item_id: '3', title: 'B Song' },
    ];
    expect(sortTracksLocally(items, [{ field: 'title', direction: 'asc' }]).map((x) => x.title)).toEqual([
      'A Song',
      'B Song',
      'C Song',
    ]);
    expect(sortTracksLocally(items, [{ field: 'title', direction: 'desc' }]).map((x) => x.title)).toEqual([
      'C Song',
      'B Song',
      'A Song',
    ]);

    const albumTracks: PlaylistSortTrack[] = [
      { playlist_item_id: '1', album: 'Album A', track_number: 3, release_date: '2020-01-01' },
      { playlist_item_id: '2', album: 'Album A', track_number: 1, release_date: '2020-01-01' },
      { playlist_item_id: '3', album: 'Album A', track_number: 2, release_date: '2020-01-01' },
    ];
    expect(
      sortTracksLocally(albumTracks, [{ field: 'track_number', direction: 'asc' }]).map((x) => x.track_number)
    ).toEqual([1, 2, 3]);
  });

  it('formats track durations and exports presets and constants', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3665)).toBe('1:01:05');
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(null)).toBe('--:--');
    expect(formatDuration(-10)).toBe('--:--');

    expect(SORT_PRESETS.length).toBeGreaterThan(5);
    expect(SORT_FIELDS.some((f) => f.value === 'artist')).toBe(true);
    expect(GENERIC_ARTIST_NAMES.has('soundtrack')).toBe(true);
    expect(NON_ALBUM_NAMES.has('single')).toBe(true);
  });
});
