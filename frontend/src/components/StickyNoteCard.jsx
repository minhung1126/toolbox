import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, CopyPlus, Pin, Tag, Trash2 } from 'lucide-react';
import { isAmbiguousNoteMutation, notesApi } from '../features/notes/api/notesApi';
import { renderTemplate, templateVariables } from '../features/notes/model/template';
import { useNoteDrafts } from '../features/notes/NoteDrafts';
import { downloadJson } from '../utils/download';
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
  const sharedDrafts = useNoteDrafts();
  const fallbackDrafts = useRef(new Map());
  const drafts = sharedDrafts || fallbackDrafts;
  const [localNote, setLocalNote] = useState(() => ({ ...note, ...drafts.current.get(note.id) }));
  const uncertainRef = useRef(Boolean(drafts.current.get(note.id)?.saveUncertain));
  const [remoteNote, setRemoteNote] = useState(null);
  const [checkingRemote, setCheckingRemote] = useState(false);
  const rememberDraft = (next) => drafts.current.set(note.id, { ...next, saveUncertain: uncertainRef.current });
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
  const {
    dirty,
    mutate,
    error: saveError,
    status: saveStatus,
    reset: resetAutosave,
    flush: flushAutosave,
  } = useDebouncedAutosave({
    value: draftOf(localNote),
    delay: 500,
    compareFn: (a, b) =>
      a.content === b.content && a.remark === b.remark && JSON.stringify(a.variables) === JSON.stringify(b.variables),
    onSave: async (nextData) => {
      if (uncertainRef.current) throw new Error('上次儲存結果待核對；請先匯出草稿並核對伺服器內容。');
      const res = await notesApi.updateNote(note.id, nextData);
      const current = drafts.current.get(note.id);
      if (current && JSON.stringify(draftOf(current)) === JSON.stringify(nextData)) drafts.current.delete(note.id);
      // A completed request must not overwrite edits made while it was in flight.
      setLocalNote((prev) => ({ ...prev, updated_at: res.note.updated_at }));
      onUpdated?.(res.note);
    },
    onError: (err) => {
      if (isAmbiguousNoteMutation(err)) {
        uncertainRef.current = true;
        const latest = drafts.current.get(note.id);
        if (latest) drafts.current.set(note.id, { ...latest, saveUncertain: true });
        toast.error('無法確認是否已儲存；新文字仍保留。請先複製或匯出草稿，再重新讀取清單核對。');
        onReconcile?.();
      } else {
        toast.error(`便利貼自動儲存失敗：${err?.message || '未知錯誤'}`);
      }
    },
  });

  useEffect(() => {
    if (!dirty && !drafts.current.has(note.id)) {
      setLocalNote(note);
    }
  }, [note, dirty, drafts]);

  const checkRemote = async () => {
    setCheckingRemote(true);
    try {
      const response = await notesApi.getNote(note.id);
      setRemoteNote(response.note);
      if (JSON.stringify(draftOf(response.note)) === JSON.stringify(draftOf(localNote))) {
        uncertainRef.current = false;
        drafts.current.delete(note.id);
        resetAutosave(draftOf(localNote));
        setLocalNote(response.note);
        onUpdated?.(response.note);
        toast.success('已讀回核對，伺服器內容與目前文字一致。');
      }
    } catch (err) {
      toast.error(`核對失敗，草稿仍保留：${err.message}`);
    } finally {
      setCheckingRemote(false);
    }
  };
  const saveAfterReview = () => {
    uncertainRef.current = false;
    rememberDraft(localNote);
    mutate(draftOf(localNote));
    flushAutosave();
    setRemoteNote(null);
  };

  const handleContentChange = (e) => {
    const newContent = e.target.value;
    setLocalNote((prev) => ({ ...prev, content: newContent }));
    rememberDraft({ ...localNote, content: newContent });
    mutate(draftOf({ ...localNote, content: newContent }));
  };

  const handleRemarkChange = (e) => {
    const newRemark = e.target.value;
    setLocalNote((prev) => ({ ...prev, remark: newRemark }));
    rememberDraft({ ...localNote, remark: newRemark });
    mutate(draftOf({ ...localNote, remark: newRemark }));
  };

  const handleVariableChange = (name, value) => {
    const next = { ...localNote, variables: { ...localNote.variables, [name]: value } };
    setLocalNote(next);
    rememberDraft(next);
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
      drafts.current.delete(note.id);
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

        {uncertainRef.current && (
          <div className="info-banner card-stack" role="alert">
            <p>上次儲存結果待核對；本次工作階段保留草稿並暫停自動儲存。請先複製或匯出。</p>
            <button type="button" className="btn btn-secondary" disabled={checkingRemote} onClick={checkRemote}>
              核對伺服器內容
            </button>
            {remoteNote && (
              <>
                <details open>
                  <summary>伺服器目前內容（與上方草稿比較）</summary>
                  <pre>{remoteNote.content}</pre>
                  <p>{remoteNote.remark}</p>
                </details>
                <button type="button" className="btn btn-primary" onClick={saveAfterReview}>
                  已核對，儲存目前草稿
                </button>
              </>
            )}
          </div>
        )}
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
            <span className="sticky-note-status" role="status">
              {saveStatus === 'failed'
                ? '儲存失敗 · 文字仍保留'
                : saveStatus === 'saving'
                  ? '儲存中…'
                  : dirty || drafts.current.has(note.id)
                    ? '有未儲存變更'
                    : '已儲存'}
            </span>
            {saveError && (
              <span role="alert">
                {saveError.message}；請複製或匯出草稿後再核對。
                {uncertainRef.current ? '結果不明，已停止後續自動儲存。' : ''}
              </span>
            )}
          </div>

          <div className="sticky-note-footer-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                downloadJson('note-draft.json', {
                  version: 1,
                  note: localNote,
                  saved: !dirty && !drafts.current.has(note.id),
                })
              }
            >
              匯出此張（含草稿）
            </button>
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
