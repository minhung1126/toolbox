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

  it.each([
    {
      source: 'array positions when the provider has omitted them',
      original: [{ playlist_item_id: '1' }, { playlist_item_id: '2' }, { playlist_item_id: '3' }],
      order: [1, 0, 2],
    },
    {
      source: 'explicit provider positions with a prototype-like ID',
      original: [
        { playlist_item_id: '__proto__', original_position: 1 },
        { playlist_item_id: 'b', original_position: 0 },
        { playlist_item_id: 'c', original_position: 2 },
      ],
      order: [0, 1, 2],
    },
  ])('calculates reorder counts using $source', ({ original, order }) => {
    const preview = buildPreviewFromSorted(
      original,
      order.map((index) => original[index])
    );
    expect(preview).toMatchObject({ total: 3, moved_count: 2, unchanged_count: 1 });
    expect(preview.items.map((item) => [item.original_position, item.new_position, item.status])).toEqual([
      [1, 0, 'moved'],
      [0, 1, 'moved'],
      [2, 2, 'unchanged'],
    ]);
  });

  it('respects track order within albums when sorting tracks locally', () => {
    const tracks = [
      { title: 'Track 3', album: 'Midnights', track_number: 3 },
      { title: 'Track 1', album: 'Midnights', track_number: 1 },
      { title: 'Track 2', album: 'Midnights', track_number: 2 },
      { title: 'Bonus', album: 'Midnights', track_number: null },
      { title: '1989 Track 2', album: '1989', track_number: 2 },
      { title: '1989 Track 1', album: '1989', track_number: 1 },
    ].map((track, index) => ({ ...track, playlist_item_id: String(index + 1) }));

    const sortedAsc = sortTracksLocally(tracks, [{ field: 'album', direction: 'asc' }]);
    expect(sortedAsc.map((t) => t.title)).toEqual([
      '1989 Track 1',
      '1989 Track 2',
      'Track 1',
      'Track 2',
      'Track 3',
      'Bonus',
    ]);

    const sortedDesc = sortTracksLocally(tracks, [{ field: 'album', direction: 'desc' }]);
    expect(sortedDesc.map((t) => t.title)).toEqual([
      'Track 1',
      'Track 2',
      'Track 3',
      'Bonus',
      '1989 Track 1',
      '1989 Track 2',
    ]);
  });

  it('orders non-album singles chronologically with albums by release year instead of shoving to front', () => {
    const tracks = [
      { title: '2024 Single', album: '', release_date: '2024-05-20', year: 2024 },
      { title: '2003 Album Track', album: '葉惠美', release_date: '2003-07-31', year: 2003, track_number: 1 },
      { title: '2010 Album Track', album: '跨時代', release_date: '2010-05-18', year: 2010, track_number: 1 },
      { title: '2000 Single', album: '單曲', release_date: '2000-11-06', year: 2000 },
    ].map((track, index) => ({ ...track, playlist_item_id: String(index + 1) }));

    const sortedAsc = sortTracksLocally(tracks, [{ field: 'album', direction: 'asc' }]);
    expect(sortedAsc.map((t) => t.title)).toEqual([
      '2000 Single',
      '2003 Album Track',
      '2010 Album Track',
      '2024 Single',
    ]);
  });

  it('orders videos (album="影片") chronologically with albums by release date instead of throwing to end', () => {
    const tracks = [
      { title: '2026 Album Track', album: 'To Be Continued', track_number: 1, release_date: '2026-06-01', year: 2026 },
      { title: "[DNFM] 'Embracing me' (Video)", album: '影片', release_date: '2023-11-09', year: 2023 },
      { title: 'Good Bye Bye (Cover Video)', album: '影片', release_date: '2024-02-08', year: 2024 },
    ].map((track, index) => ({ ...track, playlist_item_id: String(index + 1) }));

    const sortedAsc = sortTracksLocally(tracks, [{ field: 'album', direction: 'asc' }]);
    expect(sortedAsc.map((t) => t.title)).toEqual([
      "[DNFM] 'Embracing me' (Video)",
      'Good Bye Bye (Cover Video)',
      '2026 Album Track',
    ]);
  });

  it('normalizes Topic channel suffixes and keeps the rest of the artist name', () => {
    expect(normalizeArtistName('QWER - Topic')).toBe('QWER');
    expect(normalizeArtistName('QWER - 主題')).toBe('QWER');
    expect(normalizeArtistName('QWER - 主题')).toBe('QWER');
    expect(normalizeArtistName('QWER (Topic)')).toBe('QWER');
    expect(normalizeArtistName('QWER（主題）')).toBe('QWER');
    expect(normalizeArtistName('QWER-Topic')).toBe('QWER');
    expect(normalizeArtistName('QWER')).toBe('QWER');
    expect(normalizeArtistName('Topic')).toBe('Topic');
    expect(normalizeArtistName('- Topic')).toBe('- Topic');
    expect(normalizeArtistName('周杰倫 - Topic')).toBe('周杰倫');
    expect(normalizeArtistName('A-Lin (主題)')).toBe('A-Lin');
    expect(normalizeArtistName('Various Artists - 主題')).toBe('Various Artists');
    expect(normalizeArtistName('林俊傑, 蔡依林 - Topic')).toBe('林俊傑, 蔡依林');
    expect(normalizeArtistName('')).toBe('');
    expect(normalizeArtistName(null)).toBe('');
  });

  it('groups Artist and Artist - Topic together and sorts chronologically', () => {
    const tracks = [
      { title: '2024 Single', artist: 'QWER', album: '單曲', release_date: '2024-02-08', year: 2024 },
      {
        title: '2023 Album Track',
        artist: 'QWER - Topic',
        album: 'Harmony from Discord',
        release_date: '2023-10-18',
        year: 2023,
        track_number: 1,
      },
      { title: '2023 Single', artist: 'QWER', album: '單曲', release_date: '2023-11-09', year: 2023 },
      {
        title: '2024 Album Track',
        artist: 'QWER - 主題',
        album: 'MANITO',
        release_date: '2024-04-01',
        year: 2024,
        track_number: 1,
      },
    ].map((track, index) => ({ ...track, playlist_item_id: String(index + 1) }));

    const sorted = sortTracksLocally(tracks, [
      { field: 'artist', direction: 'asc' },
      { field: 'album', direction: 'asc' },
    ]);

    expect(sorted.map((t) => t.title)).toEqual(['2023 Album Track', '2023 Single', '2024 Single', '2024 Album Track']);
  });

  it('maps language codes to appropriate collation locales in getLocaleCollation', () => {
    expect(getLocaleCollation('zh_TW')).toBe('zh-Hant-TW');
    expect(getLocaleCollation('zh-TW')).toBe('zh-Hant-TW');
    expect(getLocaleCollation('zh-hant')).toBe('zh-Hant-TW');
    expect(getLocaleCollation('tw')).toBe('zh-Hant-TW');
    expect(getLocaleCollation('zh_CN')).toBe('zh-Hans-CN');
    expect(getLocaleCollation('en')).toBe('en-US');
    expect(getLocaleCollation('en_US')).toBe('en-US');
    expect(getLocaleCollation('ja')).toBe('ja-JP');
    expect(getLocaleCollation('ja_JP')).toBe('ja-JP');
    expect(getLocaleCollation('ko')).toBe('ko-KR');
    expect(getLocaleCollation('ko_KR')).toBe('ko-KR');
    expect(getLocaleCollation('fr')).toBe('fr');
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

  it('splits artist collaborations and detects primary author', () => {
    expect(splitArtists('周杰倫, 費玉清')).toEqual(['周杰倫', '費玉清']);
    expect(splitArtists('周杰倫、費玉清')).toEqual(['周杰倫', '費玉清']);
    expect(splitArtists('周杰倫 & 費玉清')).toEqual(['周杰倫', '費玉清']);
    expect(splitArtists('周杰倫 feat. 費玉清')).toEqual(['周杰倫', '費玉清']);
    expect(splitArtists('周杰倫 (feat. 費玉清)')).toEqual(['周杰倫', '費玉清']);
    expect(splitArtists('Ed Sheeran & Justin Bieber')).toEqual(['Ed Sheeran', 'Justin Bieber']);
    expect(splitArtists('QWER - Topic')).toEqual(['QWER']);
    expect(getFirstArtist('周杰倫, 費玉清')).toBe('周杰倫');
    expect(isGenericArtist('Various Artists')).toBe(true);
    expect(isGenericArtist('群星')).toBe(true);
    expect(isGenericArtist('周杰倫')).toBe(false);
  });

  it('prioritizes first author in collaborative songs under classic album sort', () => {
    const tracks = [
      { title: '夜的第七章 (feat. 潘兒)', artist: '周杰倫, 潘兒', album: '依然范特西', track_number: 1, year: 2006 },
      { title: '聽媽媽的話', artist: '周杰倫', album: '依然范特西', track_number: 2, year: 2006 },
      { title: '千里之外 (feat. 費玉清)', artist: '周杰倫, 費玉清', album: '依然范特西', track_number: 3, year: 2006 },
      { title: '本草綱目', artist: '周杰倫', album: '依然范特西', track_number: 4, year: 2006 },
      { title: '可愛女人', artist: '周杰倫', album: 'Jay', track_number: 1, year: 2000 },
    ].map((track, index) => ({ ...track, playlist_item_id: String(index + 1) }));

    const sorted = sortTracksLocally(tracks, [
      { field: 'artist', direction: 'asc' },
      { field: 'year', direction: 'asc' },
      { field: 'album', direction: 'asc' },
      { field: 'track_number', direction: 'asc' },
    ]);

    expect(sorted.map((t) => t.title)).toEqual([
      '可愛女人',
      '夜的第七章 (feat. 潘兒)',
      '聽媽媽的話',
      '千里之外 (feat. 費玉清)',
      '本草綱目',
    ]);
  });

  it('keeps collaborative song with album when first author is uncertain or guest listed first', () => {
    const tracks = [
      { title: '夜的第七章', artist: '周杰倫', album: '依然范特西', track_number: 1, year: 2006 },
      { title: '千里之外', artist: '費玉清, 周杰倫', album: '依然范特西', track_number: 2, year: 2006 },
      { title: '本草綱目', artist: '周杰倫', album: '依然范特西', track_number: 3, year: 2006 },
      { title: '一剪梅', artist: '費玉清', album: '一剪梅', track_number: 1, year: 1983 },
    ].map((track, index) => ({ ...track, playlist_item_id: String(index + 1) }));

    const sorted = sortTracksLocally(tracks, [
      { field: 'artist', direction: 'asc' },
      { field: 'year', direction: 'asc' },
      { field: 'album', direction: 'asc' },
      { field: 'track_number', direction: 'asc' },
    ]);

    const titles = sorted.map((t) => t.title);
    const jayIdx = [titles.indexOf('夜的第七章'), titles.indexOf('千里之外'), titles.indexOf('本草綱目')];
    expect(jayIdx[1]).toBe(jayIdx[0] + 1);
    expect(jayIdx[2]).toBe(jayIdx[1] + 1);
  });

  it('keeps compilation/soundtrack albums together under album sort', () => {
    const tracks = [
      { title: 'City of Stars', artist: 'Ryan Gosling', album: 'La La Land', track_number: 1, year: 2016 },
      { title: 'Audition', artist: 'Emma Stone', album: 'La La Land', track_number: 2, year: 2016 },
      { title: 'A Lovely Night', artist: 'Ryan Gosling, Emma Stone', album: 'La La Land', track_number: 3, year: 2016 },
      { title: 'Rolling in the Deep', artist: 'Adele', album: '21', track_number: 1, year: 2011 },
    ].map((track, index) => ({ ...track, playlist_item_id: String(index + 1) }));

    const sorted = sortTracksLocally(tracks, [
      { field: 'artist', direction: 'asc' },
      { field: 'year', direction: 'asc' },
      { field: 'album', direction: 'asc' },
      { field: 'track_number', direction: 'asc' },
    ]);

    const titles = sorted.map((t) => t.title);
    const laLaIdx = [titles.indexOf('City of Stars'), titles.indexOf('Audition'), titles.indexOf('A Lovely Night')];
    expect(laLaIdx[1]).toBe(laLaIdx[0] + 1);
    expect(laLaIdx[2]).toBe(laLaIdx[1] + 1);
  });
});
