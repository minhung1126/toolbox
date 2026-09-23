import React from 'react';
import { ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react';
import { SORT_FIELDS } from '../../utils/playlistSort';

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
      <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.4)', minWidth: 20 }}>#{index + 1}</span>
      <select
        className="form-select"
        value={sortKey.field}
        onChange={(e) => onChange(index, { ...sortKey, field: e.target.value })}
        style={{ flex: 1, minWidth: 0 }}
      >
        {SORT_FIELDS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
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
