import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, StickyNote } from 'lucide-react';
import { api } from '../services/api';
import StickyNoteCard from '../components/StickyNoteCard';
import { useToast } from '../components/Toast';
import { Badge, Button, EmptyState, LoadingState, PageHeader } from '../shared/ui';
import '../features/notes/notes.css';

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
    setNotes((prev) => prev.map((n) => (n.id === updatedNote.id ? { ...n, ...updatedNote } : n)));
  };

  const handleNoteDeleted = (deletedNoteId) => {
    setNotes((prev) => prev.filter((n) => n.id !== deletedNoteId));
  };

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) => (n.content || '').toLowerCase().includes(q) || (n.remark || '').toLowerCase().includes(q)
    );
  }, [notes, searchQuery]);

  return (
    <div className="section-gap sticky-notes-page">
      <PageHeader
        eyebrow="生產力工具"
        title="便利貼備忘錄"
        description="極簡純文字便利貼，支援多便籤編輯、備註標記、一鍵複製與最後修改時間追蹤。"
      />

      <div className="sticky-notes-toolbar">
        <div className="sticky-notes-toolbar-left">
          <Button onClick={handleCreateNote} disabled={creating} loading={creating} icon={Plus}>
            新增便利貼
          </Button>

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
          <Badge tone="info">
            <StickyNote size={13} aria-hidden="true" />
            <span>
              共 {notes.length} 張便籤
              {searchQuery.trim() && `（符合搜尋 ${filteredNotes.length} 張）`}
            </span>
          </Badge>
          <Button
            onClick={fetchNotes}
            disabled={loading}
            loading={loading}
            variant="secondary"
            size="sm"
            className="btn-icon"
            icon={RefreshCw}
            title="重新整理"
            aria-label="重新整理"
          />
        </div>
      </div>

      {loading && notes.length === 0 ? (
        <LoadingState className="glass-panel sticky-notes-empty">正在載入便利貼…</LoadingState>
      ) : notes.length === 0 ? (
        <div className="glass-panel">
          <EmptyState
            title="尚未建立任何便利貼"
            description="點擊「新增便利貼」開始記錄您的日常備忘、草稿或剪貼文字。"
            icon={StickyNote}
            action={
              <Button onClick={handleCreateNote} disabled={creating} loading={creating} icon={Plus}>
                立即新增第一張便利貼
              </Button>
            }
          />
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="glass-panel">
          <EmptyState
            title={`找不到符合「${searchQuery}」的便利貼內容或備註`}
            action={
              <Button variant="secondary" onClick={() => setSearchQuery('')}>
                清除搜尋條件
              </Button>
            }
          />
        </div>
      ) : (
        <div className="sticky-notes-grid">
          {filteredNotes.map((note) => (
            <StickyNoteCard key={note.id} note={note} onUpdated={handleNoteUpdated} onDeleted={handleNoteDeleted} />
          ))}
        </div>
      )}
    </div>
  );
}
