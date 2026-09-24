import React, { useEffect, useState } from 'react';
import { Check, Copy, Pin, Tag, Trash2 } from 'lucide-react';
import { notesApi } from '../features/notes/api/notesApi';
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

export default function StickyNoteCard({ note, onUpdated, onDeleted }) {
  const toast = useToast();
  const [localNote, setLocalNote] = useState(note);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { saving, dirty, mutate } = useDebouncedAutosave({
    value: { content: localNote.content, remark: localNote.remark },
    delay: 500,
    compareFn: (a, b) => a.content === b.content && a.remark === b.remark,
    onSave: async (nextData) => {
      const res = await notesApi.updateNote(note.id, nextData);
      if (res?.note) {
        setLocalNote((prev) => ({ ...prev, ...res.note }));
        onUpdated?.(res.note);
      }
    },
    onError: (err) => {
      toast.error(`便利貼自動儲存失敗：${err.message || '未知錯誤'}`);
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
    mutate({ content: newContent, remark: localNote.remark });
  };

  const handleRemarkChange = (e) => {
    const newRemark = e.target.value;
    setLocalNote((prev) => ({ ...prev, remark: newRemark }));
    mutate({ content: localNote.content, remark: newRemark });
  };

  const handleTogglePin = async () => {
    const nextPinned = !localNote.pinned;
    setLocalNote((prev) => ({ ...prev, pinned: nextPinned }));
    try {
      const res = await notesApi.updateNote(note.id, { pinned: nextPinned });
      if (res?.note) {
        onUpdated?.(res.note);
      }
      toast.success(nextPinned ? '已置頂便利貼' : '已取消置頂');
    } catch (err) {
      setLocalNote((prev) => ({ ...prev, pinned: !nextPinned }));
      toast.error(`置頂設定失敗：${err.message || '未知錯誤'}`);
    }
  };

  const handleCopy = async () => {
    try {
      await copyToClipboard(localNote.content || '');
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
      toast.error(`刪除失敗：${err.message || '未知錯誤'}`);
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
          <textarea
            className="sticky-note-textarea"
            placeholder="點擊此處輸入文字內容…"
            value={localNote.content || ''}
            onChange={handleContentChange}
            aria-label="便利貼文字內容"
          />
        </div>

        <div className="sticky-note-footer">
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

          <button
            type="button"
            className={`btn btn-secondary sticky-note-copy-btn${copied ? ' is-copied' : ''}`}
            onClick={handleCopy}
            title="一鍵複製文字內容"
            aria-label="一鍵複製文字內容"
          >
            {copied ? (
              <>
                <Check size={14} aria-hidden="true" />
                <span>已複製</span>
              </>
            ) : (
              <>
                <Copy size={14} aria-hidden="true" />
                <span>一鍵複製</span>
              </>
            )}
          </button>
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
