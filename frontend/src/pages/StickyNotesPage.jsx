import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, Sparkles, StickyNote } from 'lucide-react';
import { api } from '../services/api';
import StickyNoteCard from '../components/StickyNoteCard';
import { useToast } from '../components/Toast';

export default function StickyNotesPage() {
  const toast = useToast();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getNotes();
      setNotes(res.notes || []);
    } catch (err) {
      toast.error(`載入便利貼失敗：${err.message || '未知錯誤'}`);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleCreateNote = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await api.createNote({ content: '', remark: '', pinned: false });
      if (res?.note) {
        setNotes((prev) => [res.note, ...prev]);
        toast.success('已新增便利貼');
      }
    } catch (err) {
      toast.error(`新增便利貼失敗：${err.message || '未知錯誤'}`);
    } finally {
      setCreating(false);
    }
  };

  const handleNoteUpdated = (updatedNote) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === updatedNote.id ? { ...n, ...updatedNote } : n))
    );
  };

  const handleNoteDeleted = (deletedNoteId) => {
    setNotes((prev) => prev.filter((n) => n.id !== deletedNoteId));
  };

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) =>
        (n.content || '').toLowerCase().includes(q) ||
        (n.remark || '').toLowerCase().includes(q)
    );
  }, [notes, searchQuery]);

  return (
    <div className="section-gap sticky-notes-page">
      <header className="glass-panel page-header">
        <div className="badge badge-info dashboard-eyebrow">
          <Sparkles size={14} aria-hidden="true" /> 生產力工具
        </div>
        <h1>便利貼備忘錄</h1>
        <p className="section-desc">
          極簡純文字便利貼，支援多便籤編輯、備註標記、一鍵複製與最後修改時間追蹤。
        </p>
      </header>

      <div className="sticky-notes-toolbar">
        <div className="sticky-notes-toolbar-left">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCreateNote}
            disabled={creating}
          >
            {creating ? (
              <RefreshCw size={16} className="spin" aria-hidden="true" />
            ) : (
              <Plus size={16} aria-hidden="true" />
            )}
            <span>新增便利貼</span>
          </button>

          <div className="sticky-notes-search-box">
            <Search size={16} className="sticky-notes-search-icon" aria-hidden="true" />
            <input
              type="text"
              className="sticky-notes-search-input"
              placeholder="搜尋內容或備註…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="搜尋便利貼"
            />
            {searchQuery && (
              <button
                type="button"
                className="sticky-notes-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="清除搜尋"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="sticky-notes-toolbar-right">
          <span className="badge badge-info">
            <StickyNote size={13} aria-hidden="true" />
            <span>
              共 {notes.length} 張便籤
              {searchQuery.trim() && `（符合搜尋 ${filteredNotes.length} 張）`}
            </span>
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={fetchNotes}
            disabled={loading}
            title="重新整理"
            aria-label="重新整理"
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} aria-hidden="true" />
          </button>
        </div>
      </div>

      {loading && notes.length === 0 ? (
        <div className="glass-panel sticky-notes-empty">
          <RefreshCw size={28} className="spin" aria-hidden="true" />
          <p>正在載入便利貼…</p>
        </div>
      ) : notes.length === 0 ? (
        <div className="glass-panel sticky-notes-empty">
          <div className="sticky-notes-empty-icon">
            <StickyNote size={40} aria-hidden="true" />
          </div>
          <h3>尚未建立任何便利貼</h3>
          <p>點擊「新增便利貼」開始記錄您的日常備忘、草稿或剪貼文字。</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCreateNote}
            disabled={creating}
          >
            <Plus size={16} aria-hidden="true" />
            <span>立即新增第一張便利貼</span>
          </button>
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="glass-panel sticky-notes-empty">
          <p>找不到符合「{searchQuery}」的便利貼內容或備註。</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setSearchQuery('')}
          >
            清除搜尋條件
          </button>
        </div>
      ) : (
        <div className="sticky-notes-grid">
          {filteredNotes.map((note) => (
            <StickyNoteCard
              key={note.id}
              note={note}
              onUpdated={handleNoteUpdated}
              onDeleted={handleNoteDeleted}
            />
          ))}
        </div>
      )}
    </div>
  );
}
