import React, { useState } from 'react';
import { GripVertical, RotateCcw } from 'lucide-react';
import { StatusDot } from './PreviewTable';
import TrackSubtitle from './TrackSubtitle';
import { formatDuration } from '../../utils/playlistSort';

export default function InteractivePreviewTable({
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
          flexWrap: 'wrap',
          gap: 6,
        }}
      >
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
          <span style={{ fontSize: 11, color: 'var(--primary)' }}>可手動拖曳歌曲</span>
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
