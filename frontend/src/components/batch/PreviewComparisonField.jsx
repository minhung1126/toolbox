import React from 'react';

export default function PreviewComparisonField({ label, value, emptyLabel, multiline = false }) {
  const text = value === null || value === undefined || String(value) === '' ? emptyLabel : String(value);
  const isLong = multiline && (text.length > 280 || text.split('\n').length > 6);
  const field = (
    <p className={`batch-preview-value-text${multiline ? ' batch-preview-value-text-multiline' : ''}`}>{text}</p>
  );
  return (
    <div className="batch-preview-value">
      <span className="batch-preview-value-label">{label}</span>
      {isLong ? (
        <details className="batch-preview-expand">
          <summary>展開完整內容</summary>
          {field}
        </details>
      ) : (
        field
      )}
    </div>
  );
}
