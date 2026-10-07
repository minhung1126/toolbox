import React, { useEffect, useState } from 'react';
import { Check, Copy, CopyPlus, Pin, Tag, Trash2 } from 'lucide-react';
import { isAmbiguousNoteMutation, notesApi } from '../features/notes/api/notesApi';
import { renderTemplate, templateVariables } from '../features/notes/model/template';
import { copyToClipboard } from '../utils/clipboard';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import { useDebouncedAutosave } from '../hooks/useDebouncedAutosave';

export function formatNoteDate(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${y}/${m}/${d} ${hh}:${mm}:${ss}`;
}

export default function StickyNoteCard({ note, onUpdated, onDeleted, onReconcile, onDuplicate, duplicateDisabled }) {
  const toast = useToast();
  const [localNote, setLocalNote] = useState(note);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isTemplate = localNote.note_type === 'template';
  const variableNames = isTemplate ? templateVariables(localNote.content || '') : [];
  const result = isTemplate ? renderTemplate(localNote.content || '', localNote.variables) : localNote.content || '';
  const missingVariables = variableNames.filter(
    (name) => !Object.hasOwn(localNote.variables || {}, name) || !localNote.variables[name]
  );

  const draftOf = (value) => ({
    content: value.content,
    remark: value.remark,
    ...(value.note_type === 'template' ? { variables: value.variables || {} } : {}),
  });
  const { saving, dirty, mutate } = useDebouncedAutosave({
    value: draftOf(localNote),
    delay: 500,
    compareFn: (a, b) =>
      a.content === b.content && a.remark === b.remark && JSON.stringify(a.variables) === JSON.stringify(b.variables),
    onSave: async (nextData) => {
      const res = await notesApi.updateNote(note.id, nextData);
      // A completed request must not overwrite edits made while it was in flight.
      setLocalNote((prev) => ({ ...prev, updated_at: res.note.updated_at }));
      onUpdated?.(res.note);
    },
    onError: (err) => {
      if (isAmbiguousNoteMutation(err)) {
        toast.error('無法確認便利貼是否已儲存；請重新整理清單核對內容。');
        onReconcile?.();
      } else {
        toast.error(`便利貼自動儲存失敗：${err?.message || '未知錯誤'}`);
      }
    },
  });

  useEffect(() => {
    if (!dirty) {
      setLocalNote(note);
    }
  }, [note, dirty]);

  const handleContentChange = (e) => {
    const newContent = e.target.value;
    setLocalNote((prev) => ({ ...prev, content: newContent }));
    mutate(draftOf({ ...localNote, content: newContent }));
  };

  const handleRemarkChange = (e) => {
    const newRemark = e.target.value;
    setLocalNote((prev) => ({ ...prev, remark: newRemark }));
    mutate(draftOf({ ...localNote, remark: newRemark }));
  };

  const handleVariableChange = (name, value) => {
    const next = { ...localNote, variables: { ...localNote.variables, [name]: value } };
    setLocalNote(next);
    mutate(draftOf(next));
  };

  const handleTogglePin = async () => {
    const nextPinned = !localNote.pinned;
    setLocalNote((prev) => ({ ...prev, pinned: nextPinned }));
    try {
      const res = await notesApi.updateNote(note.id, { pinned: nextPinned });
      onUpdated?.(res.note);
      toast.success(nextPinned ? '已置頂便利貼' : '已取消置頂');
    } catch (err) {
      if (isAmbiguousNoteMutation(err)) {
        toast.error('無法確認置頂設定是否已儲存；請重新整理清單核對。');
        onReconcile?.();
      } else {
        setLocalNote((prev) => ({ ...prev, pinned: !nextPinned }));
        toast.error(`置頂設定失敗：${err?.message || '未知錯誤'}`);
      }
    }
  };

  const handleCopy = async () => {
    try {
      await copyToClipboard(result);
      setCopied(true);
      toast.success('已複製便利貼內容至剪貼簿');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error(`複製失敗：${err.message || '請手動選取文字複製'}`);
    }
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await notesApi.deleteNote(note.id);
      toast.success('便利貼已刪除');
      setConfirmDelete(false);
      onDeleted?.(note.id);
    } catch (err) {
      if (isAmbiguousNoteMutation(err) || err?.status === 404) {
        setConfirmDelete(false);
        toast.error('無法確認便利貼是否已刪除；請重新整理清單核對，勿直接重送。');
        onReconcile?.();
      } else {
        toast.error(`刪除失敗：${err?.message || '未知錯誤'}`);
      }
    } finally {
      setDeleting(false);
    }
  };

  const charCount = (localNote.content || '').length;

  return (
    <>
      <div className={`glass-panel sticky-note-card${localNote.pinned ? ' is-pinned' : ''}`} data-note-id={note.id}>
        <div className="sticky-note-header">
          <div className="sticky-note-remark-wrapper">
            <Tag size={14} className="sticky-note-remark-icon" aria-hidden="true" />
            <input
              type="text"
              className="sticky-note-remark-input"
              placeholder="便籤備註（可選）…"
              value={localNote.remark || ''}
              onChange={handleRemarkChange}
              maxLength={200}
              aria-label="便利貼備註"
            />
          </div>

          <div className="sticky-note-header-actions">
            <button
              type="button"
              className={`btn-icon-subtle${localNote.pinned ? ' is-active' : ''}`}
              onClick={handleTogglePin}
              title={localNote.pinned ? '取消置頂' : '置頂便利貼'}
              aria-label={localNote.pinned ? '取消置頂' : '置頂便利貼'}
            >
              <Pin size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn-icon-subtle btn-icon-danger"
              onClick={() => setConfirmDelete(true)}
              title="刪除便利貼"
              aria-label="刪除便利貼"
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="sticky-note-body">
          {isTemplate && <span className="sticky-note-template-label">模板 · 使用 {'{變數名稱}'}</span>}
          <textarea
            className="sticky-note-textarea"
            placeholder={isTemplate ? '例如：hi this is {name}. ......' : '點擊此處輸入文字內容…'}
            value={localNote.content || ''}
            onChange={handleContentChange}
            aria-label={isTemplate ? '模板內容' : '便利貼文字內容'}
            maxLength={20000}
          />
        </div>

        <div className="sticky-note-footer">
          {isTemplate && (
            <div className="sticky-note-template-controls">
              {variableNames.map((name) => (
                <label key={name} className="sticky-note-variable">
                  <span>{name}:</span>
                  <input
                    type="text"
                    value={Object.hasOwn(localNote.variables || {}, name) ? localNote.variables[name] : ''}
                    onChange={(event) => handleVariableChange(name, event.target.value)}
                    aria-label={`變數 ${name}`}
                    maxLength={20000}
                    placeholder="輸入替換文字"
                  />
                </label>
              ))}
              {!variableNames.length && <span>在上方輸入 {'{name}'}，即可設定替換文字。</span>}
              <span className="sticky-note-template-label">結果預覽</span>
              <div className="sticky-note-preview" aria-label="替換結果" aria-live="polite">
                {result}
              </div>
              {missingVariables.length > 0 && (
                <span role="status">尚未填寫：{missingVariables.join('、')}（複製時保留變數標記）</span>
              )}
            </div>
          )}
          <div className="sticky-note-meta">
            <span className="sticky-note-time" title={localNote.updated_at || localNote.created_at}>
              最後編輯：{formatNoteDate(localNote.updated_at || localNote.created_at)}
            </span>
            <span className="sticky-note-divider">•</span>
            <span className="sticky-note-count">{charCount} 字</span>
            {saving && (
              <>
                <span className="sticky-note-divider">•</span>
                <span className="sticky-note-status">儲存中…</span>
              </>
            )}
          </div>

          <div className="sticky-note-footer-actions">
            <button
              type="button"
              className="btn btn-secondary sticky-note-copy-btn"
              disabled={duplicateDisabled || !onDuplicate}
              onClick={() =>
                onDuplicate(
                  {
                    content: localNote.content,
                    remark: localNote.remark,
                    pinned: localNote.pinned,
                    note_type: localNote.note_type || 'plain',
                    variables: { ...localNote.variables },
                  },
                  note.id
                )
              }
            >
              <CopyPlus size={14} aria-hidden="true" />
              建立副本
            </button>
            <button
              type="button"
              className={`btn btn-secondary sticky-note-copy-btn${copied ? ' is-copied' : ''}`}
              onClick={handleCopy}
              title={isTemplate ? '複製結果' : '一鍵複製文字內容'}
              aria-label={isTemplate ? '複製結果' : '一鍵複製文字內容'}
            >
              {copied ? (
                <>
                  <Check size={14} aria-hidden="true" />
                  <span>已複製</span>
                </>
              ) : (
                <>
                  <Copy size={14} aria-hidden="true" />
                  <span>{isTemplate ? '複製結果' : '複製文字'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="刪除便利貼"
        message="確定要刪除這張便利貼嗎？此動作無法復原。"
        confirmText="刪除"
        cancelText="取消"
        variant="destructive"
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
