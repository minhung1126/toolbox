import React from 'react';

export default function PreviewField({ label, value }) {
  const hasValue = value !== null && value !== undefined && String(value).trim() !== '';
  return (
    <div className="glass-panel preview-field">
      <div className="preview-field-label">{label}</div>
      <div className={hasValue ? 'preview-field-value' : 'preview-field-value preview-field-empty'}>
        {hasValue ? String(value) : '此欄位目前是空白，請記得編輯試算表'}
      </div>
    </div>
  );
}
