import React from 'react';
import { ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react';
import { SORT_FIELDS } from '../../features/ytmusic/model/playlistSort';

export default function SortKeyRow({
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
      className={`playlist-sort-key-row${isDragTarget ? ' playlist-sort-key-row-target' : ''}`}
    >
      <div className="playlist-sort-key-grip" title="按住拖曳調整此規則的優先順序">
        <GripVertical size={16} />
      </div>
      <span className="playlist-sort-key-index">#{index + 1}</span>
      <select
        className="form-select playlist-sort-key-select"
        aria-label={`第 ${index + 1} 個排序欄位`}
        value={sortKey.field}
        onChange={(e) => onChange(index, { ...sortKey, field: e.target.value })}
      >
        {SORT_FIELDS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-secondary playlist-sort-key-direction"
        onClick={() => onChange(index, { ...sortKey, direction: sortKey.direction === 'asc' ? 'desc' : 'asc' })}
        title={sortKey.direction === 'asc' ? '升冪' : '降冪'}
      >
        {sortKey.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
        {sortKey.direction === 'asc' ? '升冪' : '降冪'}
      </button>
      {canRemove && (
        <button
          type="button"
          className="btn btn-secondary playlist-sort-key-remove"
          aria-label={`移除第 ${index + 1} 個排序條件`}
          onClick={() => onRemove(index)}
          title="移除"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
