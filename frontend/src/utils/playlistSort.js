/**
 * Pure sorting, normalization and collation algorithms for YouTube Music playlists.
 */

export function getLocaleCollation(lang) {
  if (!lang) return 'zh-Hant-TW';
  const clean = String(lang).replace(/_/g, '-').toLowerCase();
  if (clean.startsWith('zh-tw') || clean.startsWith('zh-hant') || clean === 'tw') return 'zh-Hant-TW';
  if (clean.startsWith('zh-cn') || clean.startsWith('zh-hans') || clean === 'cn') return 'zh-Hans-CN';
  if (clean.startsWith('ja')) return 'ja-JP';
  if (clean.startsWith('ko')) return 'ko-KR';
  if (clean.startsWith('en')) return 'en-US';
  return clean;
}

export const SORT_PRESETS = [
  {
    id: 'album-order',
    label: '經典完整專輯（藝人 → 年份 → 專輯 → 曲目 #）',
    keys: [
      { field: 'artist', direction: 'asc' },
      { field: 'year', direction: 'asc' },
      { field: 'album', direction: 'asc' },
      { field: 'track_number', direction: 'asc' },
    ],
  },
  {
    id: 'artist-album-track',
    label: '藝人專輯曲目（藝人 → 專輯 → 曲目 #）',
    keys: [
      { field: 'artist', direction: 'asc' },
      { field: 'album', direction: 'asc' },
      { field: 'track_number', direction: 'asc' },
    ],
  },
  { id: 'title-asc', label: '歌名 A → Z', keys: [{ field: 'title', direction: 'asc' }] },
  { id: 'title-desc', label: '歌名 Z → A', keys: [{ field: 'title', direction: 'desc' }] },
  { id: 'artist-asc', label: '頻道／藝人 A → Z', keys: [{ field: 'artist', direction: 'asc' }] },
  { id: 'artist-desc', label: '頻道／藝人 Z → A', keys: [{ field: 'artist', direction: 'desc' }] },
  { id: 'added-newest', label: '新增日期（新 → 舊）', keys: [{ field: 'added_at', direction: 'desc' }] },
  { id: 'added-oldest', label: '新增日期（舊 → 新）', keys: [{ field: 'added_at', direction: 'asc' }] },
  { id: 'published-newest', label: '發布日期（新 → 舊）', keys: [{ field: 'published_at', direction: 'desc' }] },
  { id: 'published-oldest', label: '發布日期（舊 → 新）', keys: [{ field: 'published_at', direction: 'asc' }] },
  { id: 'duration-shortest', label: '長度（短 → 長）', keys: [{ field: 'duration', direction: 'asc' }] },
  { id: 'duration-longest', label: '長度（長 → 短）', keys: [{ field: 'duration', direction: 'desc' }] },
  { id: 'random', label: '隨機排序', keys: [{ field: 'random', direction: 'asc' }] },
  { id: 'custom', label: '自訂多重排序…', keys: [] },
];

export const SORT_FIELDS = [
  { value: 'artist', label: '歌手／藝人' },
  { value: 'album', label: '專輯名稱' },
  { value: 'track_number', label: '曲目順序（第幾首）' },
  { value: 'title', label: '歌名' },
  { value: 'year', label: '發行年份' },
  { value: 'duration', label: '長度' },
  { value: 'added_at', label: '新增日期' },
  { value: 'published_at', label: '發布日期' },
  { value: 'random', label: '隨機' },
];

export function normalizeArtistName(name) {
  if (!name) return '';
  const raw = String(name).trim();
  if (!raw) return '';

  const parts = raw.split(',');
  const normalizedParts = parts.map((p) => {
    let cleaned = p.trim();
    cleaned = cleaned.replace(/\s*[-–—－]\s*(?:topic|主題|主题)\s*$/i, '');
    cleaned = cleaned.replace(/\s*[(（](?:topic|主題|主题)[)）]\s*$/i, '');
    cleaned = cleaned.trim();
    return cleaned || p.trim();
  });

  const result = normalizedParts.filter(Boolean).join(', ');
  return result || raw;
}

export const GENERIC_ARTIST_NAMES = Object.freeze(
  new Set(['various artists', 'various', 'va', '群星', '合輯', '合辑', '原聲帶', '原声带', 'soundtrack', 'ost'])
);

export const NON_ALBUM_NAMES = Object.freeze(
  new Set(['單曲', '单曲', 'single', 'singles', '影片', '视频', 'video', 'videos'])
);

export function isGenericArtist(name) {
  if (!name) return false;
  const norm = String(name).normalize('NFKC').trim().toLowerCase();
  return GENERIC_ARTIST_NAMES.has(norm);
}

export function isRealAlbum(albumName) {
  if (!albumName) return false;
  const norm = String(albumName).normalize('NFKC').trim().toLowerCase();
  return Boolean(norm && !NON_ALBUM_NAMES.has(norm));
}

export function splitArtists(name) {
  if (!name) return [];
  const raw = String(name).trim();
  if (!raw) return [];

  let cleaned = normalizeArtistName(raw);

  let extraArtists = [];
  const featParenRegex = /[([（](?:feat\.?|ft\.?|featuring|with)\s+([^\])）]+)[\])）]/i;
  const featMatch = cleaned.match(featParenRegex);
  if (featMatch) {
    const featStr = featMatch[1].trim();
    cleaned = (cleaned.slice(0, featMatch.index) + cleaned.slice(featMatch.index + featMatch[0].length)).trim();
    extraArtists = featStr
      .split(/[,、&/;]/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  const delimRegex = /\s*(?:,\s*|、|;\s*|\s+(?:feat\.?|ft\.?|featuring|with)\s+|\s+\/\s+|\s+&\s+|\s+[xX×]\s+)\s*/i;
  const parts = cleaned
    .split(delimRegex)
    .map((p) => p.trim())
    .filter(Boolean);

  const allParts = [...parts, ...extraArtists];
  const seen = new Set();
  const result = [];
  for (const p of allParts) {
    const norm = p.normalize('NFKC').trim();
    const key = norm.toLowerCase();
    if (norm && !seen.has(key)) {
      seen.add(key);
      result.push(norm);
    }
  }

  return result.length > 0 ? result : [cleaned];
}

export function getFirstArtist(name) {
  const artists = splitArtists(name);
  return artists.length > 0 ? artists[0] : name ? normalizeArtistName(name) : '';
}

export function buildAlbumContextMap(items) {
  const albumTracks = {};
  for (const item of items) {
    const rawAlbum = String(item.album || '').trim();
    if (!isRealAlbum(rawAlbum)) continue;
    const normAlbum = rawAlbum.normalize('NFKC').toLowerCase();
    if (!albumTracks[normAlbum]) {
      albumTracks[normAlbum] = [];
    }
    albumTracks[normAlbum].push(item);
  }

  const contextMap = {};
  for (const [normAlbum, tracks] of Object.entries(albumTracks)) {
    let explicitAlbumArtist = null;
    for (const trk of tracks) {
      const albArt = trk.album_artist;
      if (albArt && !isGenericArtist(albArt)) {
        explicitAlbumArtist = normalizeArtistName(String(albArt));
        break;
      }
    }

    const artistCounts = {};
    for (const trk of tracks) {
      const rawArt = trk.artist || trk.channel_title || '';
      const parsed = splitArtists(rawArt);
      const firstArt = parsed.length > 0 ? parsed[0] : normalizeArtistName(String(rawArt));
      if (firstArt && !isGenericArtist(firstArt)) {
        artistCounts[firstArt] = (artistCounts[firstArt] || 0) + 1;
      }
    }

    let dominantArtist = null;
    let maxCount = 0;
    for (const [art, count] of Object.entries(artistCounts)) {
      if (count > maxCount) {
        maxCount = count;
        dominantArtist = art;
      }
    }

    let isCompilation = false;
    if (!explicitAlbumArtist && dominantArtist) {
      if (tracks.length >= 3 && maxCount <= tracks.length / 2) {
        isCompilation = true;
      }
    }
    if (Object.keys(artistCounts).length === 0 && tracks.some((trk) => isGenericArtist(trk.artist))) {
      isCompilation = true;
    }

    let primaryArtist = explicitAlbumArtist || dominantArtist || '';
    if (isCompilation) {
      primaryArtist = explicitAlbumArtist || 'Various Artists';
    }

    let albumYear = null;
    let albumReleaseDate = null;
    for (const trk of tracks) {
      if (trk.release_date) {
        albumReleaseDate = trk.release_date;
        break;
      }
      if (trk.year && !albumYear) {
        albumYear = trk.year;
      }
    }

    contextMap[normAlbum] = {
      primaryArtist,
      isCompilation,
      year: albumYear,
      releaseDate: albumReleaseDate,
    };
  }

  return contextMap;
}

export function getEffectiveSortArtist(item, albumMap = {}) {
  const rawArtist = item.artist || item.channel_title || '';
  const rawAlbum = String(item.album || '').trim();
  const realAlbum = isRealAlbum(rawAlbum);

  const trackArtists = splitArtists(rawArtist);
  const firstArtist = trackArtists.length > 0 ? trackArtists[0] : normalizeArtistName(String(rawArtist));

  if (realAlbum) {
    const normAlbum = rawAlbum.normalize('NFKC').toLowerCase();
    const albumInfo = albumMap[normAlbum];
    if (albumInfo) {
      const albPrimary = albumInfo.primaryArtist || '';
      const isComp = albumInfo.isCompilation;

      if (isComp) {
        return albPrimary || 'Various Artists';
      }

      if (albPrimary) {
        const normAlbPrimary = albPrimary.normalize('NFKC').toLowerCase();
        const normFirst = firstArtist.normalize('NFKC').toLowerCase();

        // If first artist matches album primary artist
        if (normFirst === normAlbPrimary) {
          return albPrimary;
        }

        // If first artist is generic ("Various Artists", "群星", etc.)
        if (isGenericArtist(firstArtist)) {
          return albPrimary;
        }

        // If album primary artist is one of the collaborating artists on this track
        for (const a of trackArtists) {
          if (a.normalize('NFKC').toLowerCase() === normAlbPrimary) {
            return albPrimary;
          }
        }

        // Keep with the album
        return albPrimary;
      }
    }
  }

  return firstArtist;
}

export function sortTracksLocally(items, sortKeys, locale = 'zh-Hant-TW') {
  if (!items || items.length === 0 || !sortKeys || sortKeys.length === 0) {
    return items.map((it, i) => ({ ...it, new_position: i }));
  }

  const sorted = [...items];
  const albumMap = buildAlbumContextMap(sorted);

  for (let k = sortKeys.length - 1; k >= 0; k--) {
    const { field, direction } = sortKeys[k];
    const rev = direction === 'desc';

    sorted.sort((a, b) => {
      if (field === 'artist') {
        const aVal = getEffectiveSortArtist(a, albumMap);
        const bVal = getEffectiveSortArtist(b, albumMap);
        const aNorm = normalizeArtistName(aVal).normalize('NFKC').toLowerCase();
        const bNorm = normalizeArtistName(bVal).normalize('NFKC').toLowerCase();
        return rev
          ? bNorm.localeCompare(aNorm, locale, { numeric: true, sensitivity: 'base' })
          : aNorm.localeCompare(bNorm, locale, { numeric: true, sensitivity: 'base' });
      }
      if (field === 'album') {
        const aIsReal = isRealAlbum(a.album);
        const bIsReal = isRealAlbum(b.album);

        let aDate = String(a.release_date || (a.year ? `${a.year}` : '') || a.published_at || '')
          .replace(/-/g, '')
          .trim();
        let bDate = String(b.release_date || (b.year ? `${b.year}` : '') || b.published_at || '')
          .replace(/-/g, '')
          .trim();

        if (!aDate && aIsReal) {
          const aInfo = albumMap[String(a.album).normalize('NFKC').toLowerCase()];
          if (aInfo?.releaseDate) aDate = String(aInfo.releaseDate).replace(/-/g, '').trim();
          else if (aInfo?.year) aDate = `${aInfo.year}0000`;
        }
        if (!bDate && bIsReal) {
          const bInfo = albumMap[String(b.album).normalize('NFKC').toLowerCase()];
          if (bInfo?.releaseDate) bDate = String(bInfo.releaseDate).replace(/-/g, '').trim();
          else if (bInfo?.year) bDate = `${bInfo.year}0000`;
        }

        const aYearKey =
          aDate && aDate.length >= 4
            ? aDate.length >= 8
              ? aDate.slice(0, 8)
              : `${aDate.slice(0, 4)}0000`
            : '99999999';
        const bYearKey =
          bDate && bDate.length >= 4
            ? bDate.length >= 8
              ? bDate.slice(0, 8)
              : `${bDate.slice(0, 4)}0000`
            : '99999999';

        if (aYearKey !== bYearKey) {
          return rev ? bYearKey.localeCompare(aYearKey) : aYearKey.localeCompare(bYearKey);
        }

        if (aIsReal !== bIsReal) {
          return aIsReal ? -1 : 1; // Real album tracks first within the same year
        }

        const aVal = aIsReal ? a.album.normalize('NFKC').toLowerCase() : '';
        const bVal = bIsReal ? b.album.normalize('NFKC').toLowerCase() : '';
        const albumCmp = aVal.localeCompare(bVal, locale, { numeric: true, sensitivity: 'base' });
        if (albumCmp !== 0) {
          return rev ? -albumCmp : albumCmp;
        }

        // Same album + year: respect track_number (always ascending 1, 2, 3... within the album)
        const aTrack = a.track_number != null && a.track_number !== '' ? Number(a.track_number) : Infinity;
        const bTrack = b.track_number != null && b.track_number !== '' ? Number(b.track_number) : Infinity;
        if (aTrack !== bTrack) {
          return aTrack - bTrack;
        }
        return 0;
      }
      if (field === 'track_number') {
        const aVal =
          a.track_number != null && a.track_number !== '' ? Number(a.track_number) : rev ? -Infinity : Infinity;
        const bVal =
          b.track_number != null && b.track_number !== '' ? Number(b.track_number) : rev ? -Infinity : Infinity;
        return rev ? bVal - aVal : aVal - bVal;
      }
      if (field === 'year' || field === 'release_year' || field === 'release_date') {
        const aIsReal = isRealAlbum(a.album);
        const bIsReal = isRealAlbum(b.album);

        let aDate = String(a.release_date || (a.year ? `${a.year}` : '') || a.published_at || '')
          .replace(/-/g, '')
          .trim();
        let bDate = String(b.release_date || (b.year ? `${b.year}` : '') || b.published_at || '')
          .replace(/-/g, '')
          .trim();

        if (!aDate && aIsReal) {
          const aInfo = albumMap[String(a.album).normalize('NFKC').toLowerCase()];
          if (aInfo?.releaseDate) aDate = String(aInfo.releaseDate).replace(/-/g, '').trim();
          else if (aInfo?.year) aDate = `${aInfo.year}0000`;
        }
        if (!bDate && bIsReal) {
          const bInfo = albumMap[String(b.album).normalize('NFKC').toLowerCase()];
          if (bInfo?.releaseDate) bDate = String(bInfo.releaseDate).replace(/-/g, '').trim();
          else if (bInfo?.year) bDate = `${bInfo.year}0000`;
        }

        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        return rev ? bDate.localeCompare(aDate) : aDate.localeCompare(bDate);
      }
      if (field === 'title') {
        const aVal = (a.title || '').normalize('NFKC').toLowerCase();
        const bVal = (b.title || '').normalize('NFKC').toLowerCase();
        return rev
          ? bVal.localeCompare(aVal, locale, { numeric: true, sensitivity: 'base' })
          : aVal.localeCompare(bVal, locale, { numeric: true, sensitivity: 'base' });
      }
      if (field === 'duration') {
        const aSec = a.duration_seconds || 0;
        const bSec = b.duration_seconds || 0;
        return rev ? bSec - aSec : aSec - bSec;
      }
      if (field === 'added_at' || field === 'published_at') {
        const aVal = a[field] || '';
        const bVal = b[field] || '';
        return rev ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
      }
      if (field === 'random') {
        return Math.random() - 0.5;
      }
      return 0;
    });
  }

  return sorted.map((it, i) => ({ ...it, new_position: i }));
}

export function buildPreviewFromSorted(originalItems, sortedItems) {
  const origPositions = {};
  originalItems.forEach((it, idx) => {
    origPositions[it.playlist_item_id] = it.original_position ?? idx;
  });

  let unchanged = 0;
  let moved = 0;
  const items = sortedItems.map((it, idx) => {
    const origPos = origPositions[it.playlist_item_id] ?? it.original_position ?? idx;
    const isUnchanged = origPos === idx;
    if (isUnchanged) unchanged++;
    else moved++;
    return {
      ...it,
      status: isUnchanged ? 'unchanged' : 'moved',
      original_position: origPos,
      new_position: idx,
    };
  });

  return {
    total: originalItems.length,
    unchanged_count: unchanged,
    moved_count: moved,
    items,
  };
}

export function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds) || seconds < 0) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
