import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import StickyNoteCard, { formatNoteDate } from './StickyNoteCard';
import { api } from '../services/api';
import * as clipboardModule from '../utils/clipboard';

vi.mock('../services/api', () => ({
  api: {
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
  },
}));

vi.mock('../components/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
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
    api.updateNote.mockResolvedValueOnce({
      note: { ...mockNote, pinned: true },
    });
    const onUpdated = vi.fn();

    render(<StickyNoteCard note={mockNote} onUpdated={onUpdated} />);

    const pinBtn = screen.getByRole('button', { name: '置頂便利貼' });
    fireEvent.click(pinBtn);

    await waitFor(() => {
      expect(api.updateNote).toHaveBeenCalledWith('note-1', { pinned: true });
      expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ pinned: true }));
    });
  });

  it('opens confirm dialog and handles deletion', async () => {
    api.deleteNote.mockResolvedValueOnce({ deleted: true });
    const onDeleted = vi.fn();

    render(<StickyNoteCard note={mockNote} onDeleted={onDeleted} />);

    const deleteBtn = screen.getByRole('button', { name: '刪除便利貼' });
    fireEvent.click(deleteBtn);

    expect(screen.getByText('確定要刪除這張便利貼嗎？此動作無法復原。')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: '刪除' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.deleteNote).toHaveBeenCalledWith('note-1');
      expect(onDeleted).toHaveBeenCalledWith('note-1');
    });
  });
});
