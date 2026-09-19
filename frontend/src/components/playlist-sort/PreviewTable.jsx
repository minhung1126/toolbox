import React from 'react';
import TrackSubtitle from './TrackSubtitle';
import { formatDuration } from '../../utils/playlistSort';

export function StatusDot({ status }) {
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

export default function PreviewTable({ title, items, icon: Icon, extraHeader, sortKeys = [] }) {
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
