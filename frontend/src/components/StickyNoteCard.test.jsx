import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NoteDraftsProvider } from '../features/notes/NoteDrafts';
import StickyNoteCard, { formatNoteDate } from './StickyNoteCard';
import { notesApi } from '../features/notes/api/notesApi';
import * as clipboardModule from '../utils/clipboard';

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('../features/notes/api/notesApi', () => ({
  isAmbiguousNoteMutation: (error) =>
    ['notes_mutation_invalid', 'timeout', 'network_error'].includes(error?.code) || error?.status >= 500,
  notesApi: {
    getNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
  },
}));

vi.mock('../components/Toast', () => ({
  useToast: () => toastMocks,
}));

vi.mock('../utils/clipboard', () => ({
  copyToClipboard: vi.fn(),
}));

const mockNote = {
  id: 'note-1',
  content: '測試便利貼內容',
  remark: '待辦事項',
  pinned: false,
  created_at: '2026-09-12T10:00:00Z',
  updated_at: '2026-09-12T12:30:00Z',
};

describe('StickyNoteCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps and copies new text after an ambiguous autosave and a server reread', async () => {
    notesApi.updateNote.mockRejectedValueOnce(Object.assign(new Error('儲存逾時'), { code: 'timeout' }));
    const onReconcile = vi.fn();
    const { rerender } = render(<StickyNoteCard note={mockNote} onReconcile={onReconcile} />);
    fireEvent.change(screen.getByLabelText('便利貼文字內容'), { target: { value: '不可遺失的新草稿' } });
    expect(screen.getByText('有未儲存變更')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('儲存失敗 · 文字仍保留')).toBeInTheDocument());
    rerender(<StickyNoteCard note={{ ...mockNote }} onReconcile={onReconcile} />);
    expect(screen.getByDisplayValue('不可遺失的新草稿')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '一鍵複製文字內容' }));
    expect(clipboardModule.copyToClipboard).toHaveBeenCalledWith('不可遺失的新草稿');
    expect(screen.queryByText('已儲存', { exact: true })).not.toBeInTheDocument();
  });

  it('retains uncertain drafts across tool navigation and resumes only after a matching reread', async () => {
    notesApi.updateNote.mockReset();
    notesApi.updateNote.mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'timeout' }));
    const view = (show) => <NoteDraftsProvider>{show && <StickyNoteCard note={mockNote} />}</NoteDraftsProvider>;
    const { rerender } = render(view(true));
    fireEvent.change(screen.getByLabelText('便利貼文字內容'), { target: { value: '本次草稿' } });
    await waitFor(() => expect(screen.getByText('儲存失敗 · 文字仍保留')).toBeInTheDocument());
    rerender(view(false));
    rerender(view(true));
    expect(screen.getByDisplayValue('本次草稿')).toBeInTheDocument();
    expect(screen.getByText(/上次儲存結果待核對；本次工作階段/)).toBeInTheDocument();
    notesApi.getNote.mockResolvedValueOnce({ note: { ...mockNote, content: '本次草稿' } });
    fireEvent.click(screen.getByRole('button', { name: '核對伺服器內容' }));
    await waitFor(() => expect(screen.getByText('已儲存', { exact: true })).toBeInTheDocument());
    expect(notesApi.updateNote).toHaveBeenCalledTimes(1);
  });

  it('formats dates consistently', () => {
    expect(formatNoteDate(null)).toBe('—');
    expect(formatNoteDate('invalid-date')).toBe('—');
    const formatted = formatNoteDate('2026-09-12T12:30:00Z');
    expect(formatted).toMatch(/\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}/);
  });

  it('renders content, remark and last edited date correctly', () => {
    render(<StickyNoteCard note={mockNote} />);

    expect(screen.getByDisplayValue('待辦事項')).toBeInTheDocument();
    expect(screen.getByDisplayValue('測試便利貼內容')).toBeInTheDocument();
    expect(screen.getByText(/最後編輯：/)).toBeInTheDocument();
    expect(screen.getByText('7 字')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '一鍵複製文字內容' })).toBeInTheDocument();
  });

  it('copies content to clipboard on click and shows feedback', async () => {
    clipboardModule.copyToClipboard.mockResolvedValueOnce();

    render(<StickyNoteCard note={mockNote} />);

    const copyBtn = screen.getByRole('button', { name: '一鍵複製文字內容' });
    fireEvent.click(copyBtn);

    expect(clipboardModule.copyToClipboard).toHaveBeenCalledWith('測試便利貼內容');
    await waitFor(() => {
      expect(screen.getByText('已複製')).toBeInTheDocument();
    });
  });

  it('toggles pinned state', async () => {
    notesApi.updateNote.mockResolvedValueOnce({
      note: { ...mockNote, pinned: true },
    });
    const onUpdated = vi.fn();

    render(<StickyNoteCard note={mockNote} onUpdated={onUpdated} />);

    const pinBtn = screen.getByRole('button', { name: '置頂便利貼' });
    fireEvent.click(pinBtn);

    await waitFor(() => {
      expect(notesApi.updateNote).toHaveBeenCalledWith('note-1', { pinned: true });
      expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ pinned: true }));
    });
  });

  it('opens confirm dialog and handles deletion', async () => {
    notesApi.deleteNote.mockResolvedValueOnce({ deleted: true, note_id: 'note-1' });
    const onDeleted = vi.fn();

    render(<StickyNoteCard note={mockNote} onDeleted={onDeleted} />);

    const deleteBtn = screen.getByRole('button', { name: '刪除便利貼' });
    fireEvent.click(deleteBtn);

    expect(screen.getByText('確定要刪除這張便利貼嗎？此動作無法復原。')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: '刪除' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(notesApi.deleteNote).toHaveBeenCalledWith('note-1');
      expect(onDeleted).toHaveBeenCalledWith('note-1');
    });
  });

  it('reconciles an ambiguous deletion without claiming success', async () => {
    notesApi.deleteNote.mockRejectedValueOnce({ code: 'notes_mutation_invalid', message: '回應缺少刪除確認' });
    const onDeleted = vi.fn();
    const onReconcile = vi.fn();
    render(<StickyNoteCard note={mockNote} onDeleted={onDeleted} onReconcile={onReconcile} />);

    fireEvent.click(screen.getByRole('button', { name: '刪除便利貼' }));
    fireEvent.click(screen.getByRole('button', { name: '刪除', exact: true }));

    await waitFor(() => expect(onReconcile).toHaveBeenCalledOnce());
    expect(onDeleted).not.toHaveBeenCalled();
    expect(toastMocks.error).toHaveBeenCalledWith(expect.stringContaining('勿直接重送'));
    expect(screen.queryByText('確定要刪除這張便利貼嗎？此動作無法復原。')).not.toBeInTheDocument();
  });
  it('duplicates the current draft including unsaved template values', () => {
    const onDuplicate = vi.fn();
    render(
      <StickyNoteCard
        note={{ ...mockNote, note_type: 'template', content: 'hi {name}', variables: { name: 'min' } }}
        onDuplicate={onDuplicate}
      />
    );
    fireEvent.change(screen.getByLabelText('模板內容'), { target: { value: 'hello {name}' } });
    fireEvent.change(screen.getByLabelText('變數 name'), { target: { value: 'max' } });
    fireEvent.click(screen.getByRole('button', { name: '建立副本' }));
    expect(onDuplicate).toHaveBeenCalledWith(
      { content: 'hello {name}', remark: '待辦事項', pinned: false, note_type: 'template', variables: { name: 'max' } },
      'note-1'
    );
  });

  it('previews repeated variables, copies results, and autosaves values', async () => {
    const note = { ...mockNote, note_type: 'template', content: 'hi {name}. {name} {role}', variables: {} };
    notesApi.updateNote.mockImplementation(async (_id, patch) => ({ note: { ...note, ...patch } }));
    render(<StickyNoteCard note={note} />);
    expect(screen.getAllByLabelText('變數 name')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('變數 name'), { target: { value: 'min' } });
    expect(screen.getByLabelText('替換結果')).toHaveTextContent('hi min. min {role}');
    expect(screen.getByText(/尚未填寫：/)).toHaveTextContent('尚未填寫：role');
    fireEvent.click(screen.getByRole('button', { name: '複製結果' }));
    expect(clipboardModule.copyToClipboard).toHaveBeenCalledWith('hi min. min {role}');
    await waitFor(() =>
      expect(notesApi.updateNote).toHaveBeenCalledWith('note-1', {
        content: note.content,
        remark: note.remark,
        variables: { name: 'min' },
      })
    );
  });
});
