import React from 'react';
import { normalizeArtistName } from '../../utils/playlistSort';

export default function TrackSubtitle({ item, sortKeys = [] }) {
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
        <span key="date" style={{ color: 'rgba(255,255,255,0.45)' }} title={`發行日期：${dateVal}`}>
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
