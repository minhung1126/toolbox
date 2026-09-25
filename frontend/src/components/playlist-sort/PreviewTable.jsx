import React from 'react';
import TrackSubtitle from './TrackSubtitle';
import { formatDuration } from '../../features/ytmusic/model/playlistSort';

export function StatusDot({ status }) {
  const isUnchanged = status === 'unchanged';
  const label = isUnchanged ? '不變' : '移動';
  return (
    <span
      title={label}
      aria-label={label}
      className={`playlist-status-dot ${isUnchanged ? 'playlist-status-dot-unchanged' : 'playlist-status-dot-moved'}`}
    />
  );
}

export default function PreviewTable({ title, items, icon: Icon, extraHeader, sortKeys = [] }) {
  return (
    <div className="playlist-preview-column">
      <div className="playlist-preview-header">
        <h4 className="playlist-preview-title">
          {Icon && <Icon size={14} />}
          {title}
        </h4>
        {extraHeader}
      </div>
      <div className="playlist-preview-list">
        {items.map((item, idx) => (
          <div key={item.playlist_item_id || idx} className="playlist-preview-row">
            <StatusDot status={item.status} />
            <span className="playlist-preview-index">{idx + 1}</span>
            {item.thumbnail_url && (
              <img src={item.thumbnail_url} alt="" className="playlist-preview-thumbnail" loading="lazy" />
            )}
            <div className="playlist-preview-track">
              <div className="playlist-preview-track-title" title={item.title}>
                {item.title || '（無標題）'}
              </div>
              <TrackSubtitle item={item} sortKeys={sortKeys} />
            </div>
            <span className="playlist-preview-duration">{formatDuration(item.duration_seconds)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
