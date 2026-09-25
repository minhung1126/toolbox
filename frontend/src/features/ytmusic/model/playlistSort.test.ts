import { describe, expect, it } from 'vitest';
import { buildAlbumContextMap, buildPreviewFromSorted, sortTracksLocally } from './playlistSort';
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
});
