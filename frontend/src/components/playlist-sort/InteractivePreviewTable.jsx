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
    <div className="playlist-preview-column">
      <div className="playlist-preview-header playlist-preview-header-interactive">
        <h4 className="playlist-preview-title">
          {Icon && <Icon size={14} />}
          {title}
        </h4>
        <div className="playlist-preview-controls">
          {isManuallyAdjusted && (
            <button
              type="button"
              className="btn btn-secondary btn-sm playlist-preview-reset"
              onClick={onResetOrder}
              title="撤銷手動拖曳，重設為目前規則排序"
            >
              <RotateCcw size={12} /> 重設為規則排序
            </button>
          )}
          <span className="playlist-preview-drag-hint">可手動拖曳歌曲</span>
        </div>
      </div>
      <div className="playlist-preview-list">
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
              className={`playlist-preview-row playlist-preview-row-draggable${isDragging ? ' playlist-preview-row-dragging' : ''}${isTarget ? ' playlist-preview-row-drop-target' : ''}`}
            >
              <div className="playlist-preview-grip" title="按住拖曳以調整順序">
                <GripVertical size={14} />
              </div>
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
          );
        })}
      </div>
    </div>
  );
}
