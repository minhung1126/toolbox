import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import StickyNoteCard, { formatNoteDate } from './StickyNoteCard';
import { notesApi } from '../features/notes/api/notesApi';
import * as clipboardModule from '../utils/clipboard';

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('../features/notes/api/notesApi', () => ({
  isAmbiguousNoteMutation: (error) =>
    ['notes_mutation_invalid', 'timeout', 'network_error'].includes(error?.code) || error?.status >= 500,
  notesApi: {
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
    expect(screen.getByRole('status')).toHaveTextContent('尚未填寫：role');
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
