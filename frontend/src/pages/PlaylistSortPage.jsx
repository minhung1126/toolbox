import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  CheckCircle2,
  Disc3,
  ExternalLink,
  Globe,
  GripVertical,
  ListMusic,
  Loader2,
  Pin,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import { StatusMessage } from '../components/StatusMessage';
import { useOAuthConnect } from '../hooks/useOAuthConnect';
import useAccountWorkState from '../hooks/useAccountWorkState';
import { PATHS } from '../routes/paths';

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

const SORT_PRESETS = [
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

const SORT_FIELDS = [
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
  new Set([
    'various artists',
    'various',
    'va',
    '群星',
    '合輯',
    '合辑',
    '原聲帶',
    '原声带',
    'soundtrack',
    'ost',
  ])
);

export const NON_ALBUM_NAMES = Object.freeze(
  new Set([
    '單曲',
    '单曲',
    'single',
    'singles',
    '影片',
    '视频',
    'video',
    'videos',
  ])
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
    extraArtists = featStr.split(/[,、&/;]/).map((p) => p.trim()).filter(Boolean);
  }

  const delimRegex = /\s*(?:,\s*|、|;\s*|\s+(?:feat\.?|ft\.?|featuring|with)\s+|\s+\/\s+|\s+&\s+|\s+[xX×]\s+)\s*/i;
  const parts = cleaned.split(delimRegex).map((p) => p.trim()).filter(Boolean);

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
  return artists.length > 0 ? artists[0] : (name ? normalizeArtistName(name) : '');
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

        let aDate = String(a.release_date || (a.year ? `${a.year}` : '') || a.published_at || '').replace(/-/g, '').trim();
        let bDate = String(b.release_date || (b.year ? `${b.year}` : '') || b.published_at || '').replace(/-/g, '').trim();

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

        const aYearKey = aDate && aDate.length >= 4 ? (aDate.length >= 8 ? aDate.slice(0, 8) : `${aDate.slice(0, 4)}0000`) : '99999999';
        const bYearKey = bDate && bDate.length >= 4 ? (bDate.length >= 8 ? bDate.slice(0, 8) : `${bDate.slice(0, 4)}0000`) : '99999999';

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
        const aVal = a.track_number != null && a.track_number !== '' ? Number(a.track_number) : (rev ? -Infinity : Infinity);
        const bVal = b.track_number != null && b.track_number !== '' ? Number(b.track_number) : (rev ? -Infinity : Infinity);
        return rev ? bVal - aVal : aVal - bVal;
      }
      if (field === 'year' || field === 'release_year' || field === 'release_date') {
        const aIsReal = isRealAlbum(a.album);
        const bIsReal = isRealAlbum(b.album);

        let aDate = String(a.release_date || (a.year ? `${a.year}` : '') || a.published_at || '').replace(/-/g, '').trim();
        let bDate = String(b.release_date || (b.year ? `${b.year}` : '') || b.published_at || '').replace(/-/g, '').trim();

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
    const origPos = origPositions[it.playlist_item_id] ?? (it.original_position ?? idx);
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

function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds) || seconds < 0) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function StatusDot({ status }) {
  const isUnchanged = status === 'unchanged';
  const color = isUnchanged ? 'var(--color-success, #22c55e)' : 'var(--color-warning, #eab308)';
  const label = isUnchanged ? '不變' : '移動';
  return (
    <span
      title={label}
      aria-label={label}
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: color,
        flexShrink: 0,
      }}
    />
  );
}

function SortKeyRow({
  sortKey,
  index,
  onChange,
  onRemove,
  canRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragTarget,
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        marginBottom: 6,
        padding: '4px 6px',
        borderRadius: 6,
        background: isDragTarget ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.02)',
        border: isDragTarget ? '1px dashed var(--primary)' : '1px solid rgba(255, 255, 255, 0.05)',
        transition: 'all 0.15s ease',
      }}
    >
      <div
        style={{
          cursor: 'grab',
          display: 'flex',
          alignItems: 'center',
          color: 'rgba(255, 255, 255, 0.45)',
          padding: '0 2px',
        }}
        title="按住拖曳調整此規則的優先順序"
      >
        <GripVertical size={16} />
      </div>
      <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.4)', minWidth: 20 }}>
        #{index + 1}
      </span>
      <select
        className="form-select"
        value={sortKey.field}
        onChange={(e) => onChange(index, { ...sortKey, field: e.target.value })}
        style={{ flex: 1, minWidth: 0 }}
      >
        {SORT_FIELDS.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
        onClick={() => onChange(index, { ...sortKey, direction: sortKey.direction === 'asc' ? 'desc' : 'asc' })}
        title={sortKey.direction === 'asc' ? '升冪' : '降冪'}
      >
        {sortKey.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
        {sortKey.direction === 'asc' ? '升冪' : '降冪'}
      </button>
      {canRemove && (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '6px 8px' }}
          onClick={() => onRemove(index)}
          title="移除"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function TrackSubtitle({ item, sortKeys = [] }) {
  const parts = [];

  // 1. 歌手 / 藝人 (artist / channel_title)
  const rawArtist = item.artist || item.channel_title;
  const artist = normalizeArtistName(rawArtist);
  if (artist) {
    parts.push({
      key: 'artist',
      node: (
        <span
          key="artist"
          style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}
          title={artist}
        >
          {artist}
        </span>
      ),
    });
  }

  // 2. 專輯 (album) 或 影片標示
  const isVideo = item.album === '影片' || Boolean(item.is_video);
  const isSingle = item.album === '單曲';

  if (item.album || isVideo) {
    let albumDisplay;
    let albumTitle;
    if (isVideo) {
      albumDisplay = '🎬 影片';
      albumTitle = '影片（無專輯資訊）';
    } else if (isSingle) {
      albumDisplay = '單曲';
      albumTitle = '單曲';
    } else {
      albumDisplay = `💿 ${item.album}`;
      albumTitle = `專輯：${item.album}`;
    }

    parts.push({
      key: 'album',
      node: (
        <span
          key="album"
          style={{
            color: 'rgba(255,255,255,0.6)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 140,
          }}
          title={albumTitle}
        >
          {albumDisplay}
        </span>
      ),
    });
  }

  // 3. 曲目編號 (track_number) - 影片不顯示曲目編號
  if (!isVideo && item.track_number != null && String(item.track_number).trim() !== '') {
    parts.push({
      key: 'track_number',
      node: (
        <span
          key="track_number"
          className="badge badge-info"
          style={{ fontSize: 10, padding: '1px 5px', height: 'auto', lineHeight: '12px' }}
          title={`曲目編號：#${item.track_number}`}
        >
          #{item.track_number}
        </span>
      ),
    });
  }

  // 4. 發行日期 / 年份 (不加括號)
  const dateVal = item.release_date || (item.year ? String(item.year) : null);
  if (dateVal) {
    parts.push({
      key: 'date',
      node: (
        <span
          key="date"
          style={{ color: 'rgba(255,255,255,0.45)' }}
          title={`發行日期：${dateVal}`}
        >
          {dateVal}
        </span>
      ),
    });
  }

  // 5. 排序有用到的額外欄位 (例如發布日期 published_at、加入清單日期 added_at)
  const activeFields = new Set((sortKeys || []).map((k) => k.field));
  if (activeFields.has('published_at') && item.published_at && String(item.published_at).slice(0, 10) !== dateVal) {
    const pubStr = String(item.published_at).slice(0, 10);
    parts.push({
      key: 'published_at',
      node: (
        <span key="published_at" style={{ color: 'rgba(255,255,255,0.4)' }} title={`發布日期：${item.published_at}`}>
          發布 {pubStr}
        </span>
      ),
    });
  }

  if (activeFields.has('added_at') && item.added_at) {
    const addStr = String(item.added_at).slice(0, 10);
    parts.push({
      key: 'added_at',
      node: (
        <span key="added_at" style={{ color: 'rgba(255,255,255,0.4)' }} title={`加入清單日期：${item.added_at}`}>
          加入 {addStr}
        </span>
      ),
    });
  }

  if (parts.length === 0) return null;

  return (
    <div
      style={{
        fontSize: 11,
        color: 'rgba(255,255,255,0.45)',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        flexWrap: 'wrap',
      }}
    >
      {parts.map((p, i) => (
        <React.Fragment key={p.key}>
          {i > 0 && <span style={{ color: 'rgba(255,255,255,0.3)', userSelect: 'none' }}>・</span>}
          {p.node}
        </React.Fragment>
      ))}
    </div>
  );
}

function PreviewTable({ title, items, icon: Icon, extraHeader, sortKeys = [] }) {
  return (
    <div style={{ flex: 1, minWidth: 320 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          {Icon && <Icon size={14} />}
          {title}
        </h4>
        {extraHeader}
      </div>
      <div
        style={{
          maxHeight: 520,
          overflowY: 'auto',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(0,0,0,0.2)',
        }}
      >
        {items.map((item, idx) => (
          <div
            key={item.playlist_item_id || idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              fontSize: 13,
            }}
          >
            <StatusDot status={item.status} />
            <span style={{ color: 'rgba(255,255,255,0.4)', minWidth: 28, textAlign: 'right', fontSize: 12 }}>
              {idx + 1}
            </span>
            {item.thumbnail_url && (
              <img
                src={item.thumbnail_url}
                alt=""
                style={{ width: 44, height: 32, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                loading="lazy"
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.title}>
                {item.title || '（無標題）'}
              </div>
              <TrackSubtitle item={item} sortKeys={sortKeys} />
            </div>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, flexShrink: 0 }}>
              {formatDuration(item.duration_seconds)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InteractivePreviewTable({
  title,
  items,
  icon: Icon,
  onReorder,
  isManuallyAdjusted,
  onResetOrder,
  sortKeys = [],
}) {
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  const handleDragStart = (e, index) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', String(index));
    } catch {
      // ignore
    }
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIdx !== index) {
      setDragOverIdx(index);
    }
  };

  const handleDrop = (e, targetIdx) => {
    e.preventDefault();
    if (draggedIdx !== null && draggedIdx !== targetIdx) {
      onReorder(draggedIdx, targetIdx);
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  return (
    <div style={{ flex: 1, minWidth: 320 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <h4 style={{ margin: 0, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          {Icon && <Icon size={14} />}
          {title}
        </h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isManuallyAdjusted && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onResetOrder}
              style={{ fontSize: 11, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
              title="撤銷手動拖曳，重設為目前規則排序"
            >
              <RotateCcw size={12} /> 重設為規則排序
            </button>
          )}
          <span style={{ fontSize: 11, color: 'var(--primary)' }}>
            可手動拖曳歌曲
          </span>
        </div>
      </div>
      <div
        style={{
          maxHeight: 520,
          overflowY: 'auto',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(0,0,0,0.2)',
        }}
      >
        {items.map((item, idx) => {
          const isDragging = draggedIdx === idx;
          const isTarget = dragOverIdx === idx;

          return (
            <div
              key={item.playlist_item_id || idx}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                fontSize: 13,
                cursor: 'grab',
                opacity: isDragging ? 0.35 : 1,
                borderTop: isTarget ? '2px solid var(--primary)' : undefined,
                background: isTarget ? 'rgba(59, 130, 246, 0.08)' : undefined,
                transition: 'background 0.1s ease',
              }}
            >
              <div
                style={{
                  cursor: 'grab',
                  color: 'rgba(255, 255, 255, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                }}
                title="按住拖曳以調整順序"
              >
                <GripVertical size={14} />
              </div>
              <StatusDot status={item.status} />
              <span style={{ color: 'rgba(255,255,255,0.4)', minWidth: 28, textAlign: 'right', fontSize: 12 }}>
                {idx + 1}
              </span>
              {item.thumbnail_url && (
                <img
                  src={item.thumbnail_url}
                  alt=""
                  style={{ width: 44, height: 32, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                  loading="lazy"
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.title}>
                  {item.title || '（無標題）'}
                </div>
                <TrackSubtitle item={item} sortKeys={sortKeys} />
              </div>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, flexShrink: 0 }}>
                {formatDuration(item.duration_seconds)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PlaylistSortPage({ authUser, refreshAuthUser }) {
  const toast = useToast();

  const ytmusicAuth = authUser?.authorizations?.ytmusic;
  const isYtmusicConnected = Boolean(ytmusicAuth?.connected);
  const activeYoutubeConnected = Boolean(authUser?.youtube?.slots?.primary?.authenticated);

  // Playlist selection
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [loadingPlaylists, setLoadingPlaylists] = useState(true);
  const [playlistFilterQuery, setPlaylistFilterQuery] = useState('');

  const filteredPlaylists = useMemo(() => {
    const q = playlistFilterQuery.trim().toLowerCase();
    if (!q) return playlists;
    return playlists.filter(
      (pl) =>
        (pl.title || '').toLowerCase().includes(q) ||
        (pl.description || '').toLowerCase().includes(q)
    );
  }, [playlists, playlistFilterQuery]);

  useEffect(() => {
    if (playlistFilterQuery.trim() && filteredPlaylists.length > 0) {
      if (!filteredPlaylists.some((p) => p.id === selectedPlaylistId)) {
        setSelectedPlaylistId(filteredPlaylists[0].id);
      }
    }
  }, [playlistFilterQuery, filteredPlaylists, selectedPlaylistId]);

  // Preferences (including locale/region defaults to Taiwan)
  const { value: preferences } = useAccountWorkState('ytmusic_preferences', {
    defaultPreset: 'title-asc',
    region: 'TW',
    language: 'zh_TW',
    location: 'TW',
  });

  const activeLanguage = preferences?.language || 'zh_TW';
  const activeLocation = preferences?.location || 'TW';
  const activeCollationLocale = useMemo(() => getLocaleCollation(activeLanguage), [activeLanguage]);

  const regionDisplayLabel = useMemo(() => {
    const loc = (preferences?.location || 'TW').toUpperCase();
    const lang = preferences?.language || 'zh_TW';
    if (loc === 'TW' && (lang === 'zh_TW' || lang === 'zh-TW')) return '🇹🇼 台灣 (繁中)';
    if (loc === 'US' && lang === 'en') return '🇺🇸 美國 (英文)';
    if (loc === 'KR' && lang === 'ko') return '🇰🇷 韓國 (韓文)';
    if (loc === 'JP' && lang === 'ja') return '🇯🇵 日本 (日文)';
    return `🌐 ${lang} / ${loc}`;
  }, [preferences?.location, preferences?.language]);

  // Load playlists
  const fetchPlaylists = useCallback(async () => {
    setLoadingPlaylists(true);
    try {
      const res = await api.getPlaylistSortPlaylists({
        language: activeLanguage,
        location: activeLocation,
      });
      setPlaylists(res.playlists || []);
      if ((res.playlists || []).length > 0 && !selectedPlaylistId) {
        setSelectedPlaylistId(res.playlists[0].id);
      }
    } catch (err) {
      toast.error(`載入播放清單失敗：${err.message || '未知錯誤'}`);
    } finally {
      setLoadingPlaylists(false);
    }
  }, [toast, selectedPlaylistId, activeLanguage, activeLocation]);

  const ytmusicOAuth = useOAuthConnect({
    serviceName: 'ytmusic',
    getAuthUrl: api.getYtmusicAuthUrl,
    disconnect: api.disconnectYtmusic,
    onAfterDisconnect: async () => {
      await refreshAuthUser?.();
      fetchPlaylists();
    },
    serviceLabel: 'YouTube Music 授權',
    successMessage: '已解除 YouTube Music 授權',
  });

  // Pinned playlists persistence
  const {
    value: pinnedConfig,
    save: savePinnedConfig,
  } = useAccountWorkState('ytmusic_pinned_playlists', { ids: [] });

  const pinnedPlaylistIds = useMemo(() => {
    if (Array.isArray(pinnedConfig?.ids)) return pinnedConfig.ids;
    if (Array.isArray(pinnedConfig)) return pinnedConfig;
    return [];
  }, [pinnedConfig]);

  const pinnedPlaylists = useMemo(() => {
    if (!pinnedPlaylistIds.length || !playlists.length) return [];
    return pinnedPlaylistIds
      .map((id) => playlists.find((p) => p.id === id))
      .filter(Boolean);
  }, [pinnedPlaylistIds, playlists]);

  const isSelectedPinned = useMemo(() => {
    return selectedPlaylistId ? pinnedPlaylistIds.includes(selectedPlaylistId) : false;
  }, [selectedPlaylistId, pinnedPlaylistIds]);

  const togglePinPlaylist = useCallback((playlistId) => {
    if (!playlistId) return;
    const isPinned = pinnedPlaylistIds.includes(playlistId);
    let next;
    if (isPinned) {
      next = pinnedPlaylistIds.filter((id) => id !== playlistId);
      toast.info('已從常用清單取消釘選');
    } else {
      next = [...pinnedPlaylistIds, playlistId];
      toast.success('已加入常用釘選清單');
    }
    savePinnedConfig({ ids: next }, { debounceMs: 0 })?.then((res) => {
      if (!res) {
        toast.error('儲存常用釘選清單失敗，請稍後重試。');
      }
    });
  }, [pinnedPlaylistIds, savePinnedConfig, toast]);

  // Split filtered playlists into pinned and unpinned
  const { pinnedFiltered, unpinnedFiltered } = useMemo(() => {
    const pinnedSet = new Set(pinnedPlaylistIds);
    const pinned = [];
    const unpinned = [];
    for (const pl of filteredPlaylists) {
      if (pinnedSet.has(pl.id)) {
        pinned.push(pl);
      } else {
        unpinned.push(pl);
      }
    }
    return { pinnedFiltered: pinned, unpinnedFiltered: unpinned };
  }, [filteredPlaylists, pinnedPlaylistIds]);

  // Sort configuration auto-save
  const {
    ready: sortConfigReady,
    value: sortConfig,
    save: saveSortConfig,
    saving: savingConfig,
    saved: savedConfig,
  } = useAccountWorkState('ytmusic_sort_config', {});

  const [presetMode, setPresetMode] = useState(
    () => sortConfig?.presetMode || preferences?.defaultPreset || 'title-asc'
  );
  const [customKeys, setCustomKeys] = useState(() => {
    if (Array.isArray(sortConfig?.customKeys) && sortConfig.customKeys.length > 0) {
      return sortConfig.customKeys;
    }
    return [{ field: 'title', direction: 'asc' }];
  });

  // Apply options
  const [applyMode, setApplyMode] = useState(() => sortConfig?.applyMode || 'in_place'); // 'in_place' | 'new_playlist'

  // Helper to persist current sorting setup
  const persistConfig = useCallback((patch = {}) => {
    saveSortConfig({
      presetMode,
      customKeys,
      applyMode,
      selectedPlaylistId,
      ...patch,
    });
  }, [presetMode, customKeys, applyMode, selectedPlaylistId, saveSortConfig]);

  // Asynchronous restore from persisted sortConfig
  const restoredConfigRef = useRef(false);
  useEffect(() => {
    if (sortConfigReady && !restoredConfigRef.current && sortConfig && typeof sortConfig === 'object') {
      let restored = false;
      if (sortConfig.presetMode) {
        setPresetMode(sortConfig.presetMode);
        restored = true;
      } else if (preferences?.defaultPreset) {
        setPresetMode(preferences.defaultPreset);
      }
      if (Array.isArray(sortConfig.customKeys) && sortConfig.customKeys.length > 0) {
        setCustomKeys(sortConfig.customKeys);
        restored = true;
      }
      if (sortConfig.applyMode) {
        setApplyMode(sortConfig.applyMode);
        restored = true;
      }
      if (sortConfig.selectedPlaylistId && !selectedPlaylistId) {
        setSelectedPlaylistId(sortConfig.selectedPlaylistId);
        restored = true;
      }
      if (restored) {
        restoredConfigRef.current = true;
      }
    }
  }, [sortConfigReady, sortConfig, preferences?.defaultPreset, selectedPlaylistId]);

  // Preview & Cached Simulation
  const [previewData, setPreviewData] = useState(null);
  const [previewToken, setPreviewToken] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [quotaEstimate, setQuotaEstimate] = useState(null);
  const [cachedOriginalTracks, setCachedOriginalTracks] = useState(null);
  const [isManuallyAdjusted, setIsManuallyAdjusted] = useState(false);

  // Drag state for sort rules
  const [draggedRuleIdx, setDraggedRuleIdx] = useState(null);
  const [dragOverRuleIdx, setDragOverRuleIdx] = useState(null);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState(null);

  const activeSortKeys = useMemo(() => {
    if (presetMode === 'custom') return customKeys;
    const preset = SORT_PRESETS.find((p) => p.id === presetMode);
    return preset?.keys || [{ field: 'title', direction: 'asc' }];
  }, [presetMode, customKeys]);

  useEffect(() => {
    fetchPlaylists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset preview when selected playlist changes
  useEffect(() => {
    setPreviewData(null);
    setPreviewToken('');
    setQuotaEstimate(null);
    setCachedOriginalTracks(null);
    setIsManuallyAdjusted(false);
    setApplyResult(null);
  }, [selectedPlaylistId]);

  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId);

  // Auto initialize new playlist title when selected playlist changes
  useEffect(() => {
    if (selectedPlaylist?.title) {
      setNewPlaylistTitle(`[已排序] ${selectedPlaylist.title}`);
    }
  }, [selectedPlaylist]);

  // Instant local simulation when cached tracks are present and sort rules change
  useEffect(() => {
    if (!cachedOriginalTracks || cachedOriginalTracks.length === 0) return;

    const locallySorted = sortTracksLocally(cachedOriginalTracks, activeSortKeys, activeCollationLocale);
    const simulatedPreview = buildPreviewFromSorted(cachedOriginalTracks, locallySorted);
    setPreviewData(simulatedPreview);
    setIsManuallyAdjusted(false);
  }, [cachedOriginalTracks, activeSortKeys, activeCollationLocale]);

  const handlePreview = useCallback(async () => {
    if (!selectedPlaylistId) {
      toast.warning('請先選擇播放清單');
      return;
    }
    if (activeSortKeys.length === 0) {
      toast.warning('請至少指定一個排序欄位');
      return;
    }
    setPreviewing(true);
    setPreviewData(null);
    setApplyResult(null);
    try {
      const res = await api.previewPlaylistSort({
        playlistId: selectedPlaylistId,
        sortKeys: activeSortKeys,
        language: activeLanguage,
        location: activeLocation,
      });
      setPreviewData(res.preview || null);
      setPreviewToken(res.preview_token || '');
      setQuotaEstimate(res.quota_estimate || null);
      setIsManuallyAdjusted(false);

      // Cache original items for instant zero-latency client simulation
      if (res.preview?.items) {
        const sortedOriginal = [...res.preview.items].sort(
          (a, b) => (a.original_position ?? 0) - (b.original_position ?? 0)
        );
        setCachedOriginalTracks(sortedOriginal);
      }

      const moved = res.preview?.moved_count ?? 0;
      const total = res.preview?.total ?? 0;
      if (moved === 0) {
        toast.success(`清單已是正確順序，無需排序（共 ${total} 首）`);
      } else {
        toast.success(`預覽完成：${moved} 首需移動 / 共 ${total} 首（已啟用即時動態模擬）`);
      }
    } catch (err) {
      toast.error(`預覽失敗：${err.message || '未知錯誤'}`);
    } finally {
      setPreviewing(false);
    }
  }, [selectedPlaylistId, activeSortKeys, activeLanguage, activeLocation, toast]);

  // Handle reordering tracks manually via drag-and-drop in the right preview list
  const handleReorderTracks = useCallback((sourceIdx, targetIdx) => {
    if (!previewData?.items || !cachedOriginalTracks) return;

    const currentSorted = [...previewData.items];
    const [dragged] = currentSorted.splice(sourceIdx, 1);
    currentSorted.splice(targetIdx, 0, dragged);

    const updatedPreview = buildPreviewFromSorted(cachedOriginalTracks, currentSorted);
    setPreviewData(updatedPreview);
    setIsManuallyAdjusted(true);
  }, [previewData, cachedOriginalTracks]);

  // Reset to automated rule order
  const handleResetToRuleOrder = useCallback(() => {
    if (!cachedOriginalTracks) return;
    const locallySorted = sortTracksLocally(cachedOriginalTracks, activeSortKeys, activeCollationLocale);
    const simulatedPreview = buildPreviewFromSorted(cachedOriginalTracks, locallySorted);
    setPreviewData(simulatedPreview);
    setIsManuallyAdjusted(false);
    toast.info('已重設為目前規則排序');
  }, [cachedOriginalTracks, activeSortKeys, activeCollationLocale, toast]);

  const handleApplyClick = useCallback(() => {
    if (!previewData || (applyMode === 'in_place' && previewData.moved_count === 0)) {
      toast.info('清單順序無需變更');
      return;
    }
    setShowConfirm(true);
  }, [previewData, applyMode, toast]);

  const handleApplyConfirm = useCallback(async () => {
    setShowConfirm(false);
    setApplying(true);
    try {
      const payload = {
        playlistId: selectedPlaylistId,
        sortKeys: activeSortKeys,
        previewToken,
        language: activeLanguage,
        location: activeLocation,
      };
      if (applyMode === 'new_playlist') {
        payload.mode = 'new_playlist';
        payload.newPlaylistTitle = newPlaylistTitle;
      }
      if (previewData?.items && previewData.items.length > 0) {
        payload.sortedItemIds = previewData.items.map((it) => it.playlist_item_id);
      }
      const res = await api.applyPlaylistSort(payload);
      setApplyResult(res);
      const succeeded = res.succeeded ?? 0;
      const failed = res.failed ?? 0;
      if (failed > 0) {
        toast.warning(`排序完成：成功 ${succeeded} / 失敗 ${failed}`);
      } else if (res.mode === 'new_playlist') {
        toast.success(`全新已排序清單「${newPlaylistTitle}」已成功建立！`);
      } else {
        toast.success(`排序成功套用！已移動 ${succeeded} 首歌曲`);
      }
      setPreviewData(null);
      setPreviewToken('');
      setQuotaEstimate(null);
      setCachedOriginalTracks(null);
      setIsManuallyAdjusted(false);
    } catch (err) {
      toast.error(`套用排序失敗：${err.message || '未知錯誤'}`);
    } finally {
      setApplying(false);
    }
  }, [selectedPlaylistId, activeSortKeys, previewToken, applyMode, newPlaylistTitle, previewData, activeLanguage, activeLocation, toast]);

  // Drag & drop handlers for sort rule keys
  const handleRuleDragStart = (e, index) => {
    setDraggedRuleIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleRuleDragOver = (e, index) => {
    e.preventDefault();
    if (dragOverRuleIdx !== index) {
      setDragOverRuleIdx(index);
    }
  };

  const handleRuleDrop = (e, targetIdx) => {
    e.preventDefault();
    if (draggedRuleIdx !== null && draggedRuleIdx !== targetIdx) {
      const next = [...customKeys];
      const [moved] = next.splice(draggedRuleIdx, 1);
      next.splice(targetIdx, 0, moved);
      setCustomKeys(next);
      persistConfig({ customKeys: next });
    }
    setDraggedRuleIdx(null);
    setDragOverRuleIdx(null);
  };

  const handleRuleDragEnd = () => {
    setDraggedRuleIdx(null);
    setDragOverRuleIdx(null);
  };

  const handleCustomKeyChange = useCallback((index, newKey) => {
    const next = customKeys.map((k, i) => (i === index ? newKey : k));
    setCustomKeys(next);
    persistConfig({ customKeys: next });
  }, [customKeys, persistConfig]);

  const handleCustomKeyRemove = useCallback((index) => {
    const next = customKeys.filter((_, i) => i !== index);
    setCustomKeys(next);
    persistConfig({ customKeys: next });
  }, [customKeys, persistConfig]);

  const handleAddCustomKey = useCallback(() => {
    if (customKeys.length >= 5) return;
    const next = [...customKeys, { field: 'title', direction: 'asc' }];
    setCustomKeys(next);
    persistConfig({ customKeys: next });
  }, [customKeys, persistConfig]);

  // Build original items for preview table
  const originalItems = cachedOriginalTracks
    ? cachedOriginalTracks
    : previewData?.items
    ? [...previewData.items].sort((a, b) => (a.original_position ?? 0) - (b.original_position ?? 0))
    : [];

  const sortedItems = previewData?.items || [];

  return (
    <div className="section-gap">
      {/* Page Header */}
      <header className="glass-panel page-header card-padding">
        <div className="badge badge-info dashboard-eyebrow">
          <Sparkles size={14} aria-hidden="true" /> YouTube Music
        </div>
        <h1>YouTube Music 播放清單排序</h1>
        <p className="section-desc">
          讀取個人 YouTube Music 播放清單，以歌手／藝人、專輯名稱、歌曲曲目順序、歌名等多重規則自訂排序。支援拖曳順序與即時快取動態模擬比對，零配額消耗（0 API Credit）。
        </p>
      </header>

      {/* YouTube Music In-Place Authorization Status */}
      <section className="glass-panel card-padding">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="icon-box icon-box-primary" style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>
              <Disc3 size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '1rem' }}>YouTube Music 連線模式</strong>
                {isYtmusicConnected ? (
                  <span className="badge badge-connected"><CheckCircle2 size={12} /> 專屬帳號 / Token 已連線</span>
                ) : activeYoutubeConnected ? (
                  <span className="badge badge-info">共用 YouTube 頻道授權</span>
                ) : (
                  <span className="badge badge-disconnected"><AlertTriangle size={12} /> 尚未授權</span>
                )}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>
                {isYtmusicConnected
                  ? `已連結 YouTube Music：${ytmusicAuth?.user?.email || (ytmusicAuth?.has_custom_token ? '自訂瀏覽器 Token' : '已授權')}。排序作業採用 YouTube Music 協定，不消耗 Google API 配額。`
                  : activeYoutubeConnected
                  ? `目前沿用主要 YouTube 頻道（${authUser?.youtube?.slots?.primary?.channel_title || '品牌頻道'}）授權。若要使用個人日常音樂帳號，建議至設定頁連結 YouTube Music 專屬帳號。`
                  : '尚未連結 YouTube 或 YouTube Music 帳號，請先完成授權以載入個人播放清單。'}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link
              to={PATHS.ytmusicSettings}
              className="btn btn-secondary btn-sm"
              title="前往 YouTube Music 設定（可切換歌名與歌手名地區顯示）"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Globe size={14} />
              <span>地區：{regionDisplayLabel}</span>
              <Settings size={14} style={{ marginLeft: 2 }} />
            </Link>
            {isYtmusicConnected ? (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={ytmusicOAuth.handleConnect}
                  disabled={ytmusicOAuth.connecting}
                >
                  <RefreshCw size={14} className={ytmusicOAuth.connecting ? 'spin' : ''} /> 重新授權
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ color: 'var(--color-danger, #ef4444)' }}
                  onClick={() => ytmusicOAuth.setConfirmDisconnect(true)}
                >
                  解除授權
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={ytmusicOAuth.handleConnect}
                disabled={ytmusicOAuth.connecting}
              >
                {ytmusicOAuth.connecting ? <Loader2 size={14} className="spin" /> : <Disc3 size={14} />} 連結 YouTube Music 專屬帳號
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Step 1: Select Playlist */}
      <section className="glass-panel card-padding">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ListMusic size={18} /> 選擇播放清單
          </h3>
          {playlists.length > 0 && (
            <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>
              {playlistFilterQuery
                ? `篩選符合 ${filteredPlaylists.length} / 共 ${playlists.length} 個`
                : `共 ${playlists.length} 個播放清單`}
            </span>
          )}
        </div>

        {/* Playlist Name Filter Input */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'rgba(255,255,255,0.4)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            className="form-input"
            placeholder="依播放清單名稱或說明快速篩選…"
            value={playlistFilterQuery}
            onChange={(e) => setPlaylistFilterQuery(e.target.value)}
            disabled={loadingPlaylists || playlists.length === 0}
            style={{ paddingLeft: 32, paddingRight: playlistFilterQuery ? 32 : 12, width: '100%' }}
          />
          {playlistFilterQuery && (
            <button
              type="button"
              onClick={() => setPlaylistFilterQuery('')}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
                padding: 4,
              }}
              title="清除篩選"
              aria-label="清除篩選"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Pinned Playlists Quick Access Chips */}
        {pinnedPlaylists.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Pin size={13} style={{ transform: 'rotate(45deg)' }} /> 常用釘選：
            </span>
            {pinnedPlaylists.map((pl) => {
              const isCurrent = pl.id === selectedPlaylistId;
              return (
                <button
                  key={pl.id}
                  type="button"
                  className={`badge ${isCurrent ? 'badge-primary' : 'badge-secondary'}`}
                  style={{
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 8px',
                    border: isCurrent ? '1px solid var(--color-primary, #3b82f6)' : '1px solid rgba(255,255,255,0.12)',
                    background: isCurrent ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255,255,255,0.06)',
                    color: isCurrent ? '#fff' : 'rgba(255,255,255,0.85)',
                    borderRadius: 6,
                  }}
                  onClick={() => {
                    setSelectedPlaylistId(pl.id);
                    persistConfig({ selectedPlaylistId: pl.id });
                  }}
                  title={`快速切換至「${pl.title}」`}
                >
                  <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pl.title}
                  </span>
                  <span style={{ fontSize: 11, opacity: 0.6 }}>({pl.item_count})</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePinPlaylist(pl.id);
                    }}
                    style={{ marginLeft: 3, opacity: 0.65, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                    title="取消釘選"
                  >
                    <X size={12} />
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="form-select"
            value={selectedPlaylistId}
            onChange={(e) => {
              setSelectedPlaylistId(e.target.value);
              persistConfig({ selectedPlaylistId: e.target.value });
            }}
            disabled={loadingPlaylists || filteredPlaylists.length === 0}
            style={{ flex: 1, minWidth: 200 }}
          >
            {loadingPlaylists ? (
              <option value="">載入中…</option>
            ) : filteredPlaylists.length === 0 ? (
              <option value="">
                {playlists.length === 0 ? '找不到播放清單' : '無符合關鍵字的播放清單'}
              </option>
            ) : (
              <>
                {pinnedFiltered.length > 0 && (
                  <optgroup label="📌 常用釘選清單">
                    {pinnedFiltered.map((pl) => (
                      <option key={pl.id} value={pl.id}>
                        📌 {pl.title} ({pl.item_count} 首)
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label={pinnedFiltered.length > 0 ? '全部播放清單' : '播放清單'}>
                  {unpinnedFiltered.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.title} ({pl.item_count} 首)
                    </option>
                  ))}
                </optgroup>
              </>
            )}
          </select>
          <button
            type="button"
            className={`btn ${isSelectedPinned ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => togglePinPlaylist(selectedPlaylistId)}
            disabled={!selectedPlaylistId || loadingPlaylists}
            title={isSelectedPinned ? '取消釘選此播放清單' : '釘選目前播放清單至頂端常用'}
            aria-label={isSelectedPinned ? '取消釘選此播放清單' : '釘選目前播放清單至頂端常用'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <Pin size={14} style={{ fill: isSelectedPinned ? 'currentColor' : 'none' }} />
            {isSelectedPinned ? '已釘選' : '釘選'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchPlaylists}
            disabled={loadingPlaylists}
            title="重新整理清單"
          >
            <RefreshCw size={14} className={loadingPlaylists ? 'spin' : ''} />
          </button>
        </div>
        {selectedPlaylist && (
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            {selectedPlaylist.description || '無說明'} · {selectedPlaylist.privacy_status === 'private' ? '私人' : selectedPlaylist.privacy_status === 'unlisted' ? '不公開' : '公開'}
          </p>
        )}
      </section>

      {/* Step 2: Sort Rules */}
      <section className="glass-panel card-padding">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ArrowUpDown size={18} /> 排序規則
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {savingConfig ? (
              <span className="badge badge-warning" style={{ fontSize: 11, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Loader2 size={12} className="spin" /> 儲存設定中…
              </span>
            ) : savedConfig ? (
              <span className="badge badge-connected" style={{ fontSize: 11, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle2 size={12} /> 排序設定已自動儲存
              </span>
            ) : (
              <span className="badge badge-info" style={{ fontSize: 11, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle2 size={12} /> 自動記憶設定
              </span>
            )}
            {cachedOriginalTracks && (
              <span className="badge badge-connected" style={{ fontSize: 11, padding: '2px 8px' }}>
                ⚡ 即時快取動態模擬中
              </span>
            )}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <select
            className="form-select"
            value={presetMode}
            onChange={(e) => {
              const next = e.target.value;
              setPresetMode(next);
              persistConfig({ presetMode: next });
            }}
            style={{ maxWidth: 460 }}
          >
            {SORT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        {presetMode === 'custom' && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
              可按住左側圖示拖曳以調整順位優先層級（靠上層者優先排序）：
            </p>
            {customKeys.map((k, i) => (
              <SortKeyRow
                key={i}
                sortKey={k}
                index={i}
                onChange={handleCustomKeyChange}
                onRemove={handleCustomKeyRemove}
                canRemove={customKeys.length > 1}
                onDragStart={handleRuleDragStart}
                onDragOver={handleRuleDragOver}
                onDrop={handleRuleDrop}
                onDragEnd={handleRuleDragEnd}
                isDragTarget={dragOverRuleIdx === i}
              />
            ))}
            {customKeys.length < 5 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleAddCustomKey}
                style={{ fontSize: 13, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Plus size={14} /> 新增排序順位
              </button>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handlePreview}
            disabled={previewing || !selectedPlaylistId || applying}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {previewing ? <Loader2 size={15} className="spin" /> : <ArrowUpDown size={15} />}
            {previewing ? '預覽中…' : '模擬預覽'}
          </button>
          {cachedOriginalTracks && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handlePreview}
              disabled={previewing}
              style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}
              title="重新向伺服器拉取最新歌曲資料並更新快取"
            >
              <RefreshCw size={14} className={previewing ? 'spin' : ''} /> 重新讀取歌曲快取
            </button>
          )}
        </div>
      </section>

      {/* Step 3: Side-by-Side Live Preview Results */}
      {previewData && (
        <section className="glass-panel card-padding">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              左右比對預覽結果
            </h3>
            <div style={{ display: 'flex', gap: 16, fontSize: 13, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <StatusDot status="unchanged" /> 不變 {previewData.unchanged_count} 首
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <StatusDot status="moved" /> 移動 {previewData.moved_count} 首
              </span>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                共 {previewData.total} 首
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <PreviewTable
              title="目前原始順序"
              items={originalItems}
              sortKeys={activeSortKeys}
            />
            <InteractivePreviewTable
              title="即時排序結果"
              items={sortedItems}
              icon={ArrowUpDown}
              sortKeys={activeSortKeys}
              onReorder={handleReorderTracks}
              isManuallyAdjusted={isManuallyAdjusted}
              onResetOrder={handleResetToRuleOrder}
            />
          </div>
        </section>
      )}

      {/* Step 4: Apply Configuration */}
      {previewData && (previewData.moved_count > 0 || applyMode === 'new_playlist') && !applyResult && (
        <section className="glass-panel card-padding">
          <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem' }}>
            套用模式與配額資訊
          </h3>

          {quotaEstimate && (
            <div style={{ marginBottom: 16 }}>
              {quotaEstimate.total_units === 0 ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 8,
                  backgroundColor: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                  color: '#4ade80',
                  fontSize: 13,
                }}>
                  <CheckCircle2 size={18} />
                  <span>
                    <strong>YouTube Music Token 協定運作中</strong>：本次操作預計移動 {previewData.moved_count} 首歌曲，
                    <strong>消耗 0 Google API 配額點數</strong>。
                  </span>
                </div>
              ) : (
                <StatusMessage tone="warning" title="API 配額消耗預估">
                  <span>
                    本次排序將移動 <strong>{previewData.moved_count}</strong> 首歌曲，
                    預估消耗 <strong>{quotaEstimate.total_units?.toLocaleString()}</strong> API 配額點數
                    （每次移動 {quotaEstimate.units_per_move} 點）。
                  </span>
                </StatusMessage>
              )}
            </div>
          )}

          {/* Sort Mode Selection */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input
                type="radio"
                name="apply_mode"
                value="in_place"
                checked={applyMode === 'in_place'}
                onChange={() => {
                  setApplyMode('in_place');
                  persistConfig({ applyMode: 'in_place' });
                }}
              />
              <span>就地重新排序原播放清單</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input
                type="radio"
                name="apply_mode"
                value="new_playlist"
                checked={applyMode === 'new_playlist'}
                onChange={() => {
                  setApplyMode('new_playlist');
                  persistConfig({ applyMode: 'new_playlist' });
                }}
              />
              <span>另存為新排序歌單（保留原歌單備份）</span>
            </label>
          </div>

          {applyMode === 'new_playlist' && (
            <div style={{ marginBottom: 14, maxWidth: 400 }}>
              <label className="form-label" htmlFor="new-playlist-title" style={{ fontSize: 13 }}>
                新播放清單名稱
              </label>
              <input
                id="new-playlist-title"
                type="text"
                className="form-input"
                value={newPlaylistTitle}
                onChange={(e) => setNewPlaylistTitle(e.target.value)}
                placeholder="輸入新播放清單名稱…"
              />
            </div>
          )}

          <div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleApplyClick}
              disabled={applying}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {applying ? <Loader2 size={15} className="spin" /> : <Check size={15} />}
              {applying ? '套用中…' : applyMode === 'new_playlist' ? '建立新排序歌單' : '套用排序'}
            </button>
          </div>
        </section>
      )}

      {/* Apply Result */}
      {applyResult && (
        <section className="glass-panel card-padding">
          <StatusMessage
            tone={applyResult.failed > 0 ? 'warning' : 'success'}
            title={applyResult.failed > 0 ? '排序完成（有部分失敗）' : '排序成功套用'}
          >
            <div>
              <span>
                成功移動 <strong>{applyResult.succeeded}</strong> 首，
                {applyResult.failed > 0 && (<>失敗 <strong>{applyResult.failed}</strong> 首，</>)}
                消耗 <strong>{applyResult.quota_used?.toLocaleString() ?? 0}</strong> API 配額點數。
              </span>
              {applyResult.new_playlist_url && (
                <div style={{ marginTop: 8 }}>
                  <a
                    href={applyResult.new_playlist_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <ExternalLink size={14} /> 前往 YouTube Music 查看新歌單
                  </a>
                </div>
              )}
            </div>
          </StatusMessage>
        </section>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={showConfirm}
        title="確認套用排序"
        onConfirm={handleApplyConfirm}
        onCancel={() => setShowConfirm(false)}
        confirmText="確認套用"
        cancelText="取消"
        busy={applying}
      >
        <div>
          <p>
            即將對播放清單「<strong>{selectedPlaylist?.title || selectedPlaylistId}</strong>」套用排序，
            將移動 <strong>{previewData?.moved_count || 0}</strong> 首歌曲。
          </p>
          {applyMode === 'new_playlist' ? (
            <p style={{ color: 'var(--color-success, #22c55e)' }}>
              ✓ 將保留原始播放清單，並為您建立全新的已排序播放清單「<strong>{newPlaylistTitle}</strong>」。
            </p>
          ) : quotaEstimate?.total_units === 0 ? (
            <p style={{ color: 'var(--color-success, #22c55e)' }}>
              ✓ 使用 YouTube Music Token 更新，<strong>消耗 0 API 配額點數</strong>。
            </p>
          ) : quotaEstimate && (
            <p style={{ color: 'var(--color-warning, #eab308)' }}>
              ⚠ 預估消耗 <strong>{quotaEstimate.total_units?.toLocaleString()}</strong> API 配額點數。
              此操作不可自動撤銷。
            </p>
          )}
          <p>確定要繼續嗎？</p>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={ytmusicOAuth.confirmDisconnect}
        title="解除 YouTube Music 授權"
        message="確定要解除 YouTube Music 專屬授權嗎？解除後將無法直接讀取該帳號的個人音樂播放清單，直到重新授權為止。"
        confirmText="確認解除"
        cancelText="取消"
        variant="destructive"
        onConfirm={ytmusicOAuth.handleConfirmDisconnect}
        onCancel={() => ytmusicOAuth.setConfirmDisconnect(false)}
      />
    </div>
  );
}
