import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import StickyNotesPage from './StickyNotesPage';
import { notesApi } from '../features/notes/api/notesApi';

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('../features/notes/api/notesApi', () => ({
  notesApi: {
    getNotes: vi.fn(),
    createNote: vi.fn(),
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

const mockNotes = [
  {
    id: 'n1',
    content: '第一張便利貼內容',
    remark: '工作備忘',
    pinned: false,
    created_at: '2026-09-12T10:00:00Z',
    updated_at: '2026-09-12T11:00:00Z',
  },
  {
    id: 'n2',
    content: '第二張購物清單',
    remark: '生活採買',
    pinned: true,
    created_at: '2026-09-12T12:00:00Z',
    updated_at: '2026-09-12T13:00:00Z',
  },
];

describe('StickyNotesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders notes list fetched from api', async () => {
    notesApi.getNotes.mockResolvedValueOnce({ notes: mockNotes, total: 2 });

    render(<StickyNotesPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('第一張便利貼內容')).toBeInTheDocument();
      expect(screen.getByDisplayValue('第二張購物清單')).toBeInTheDocument();
      expect(screen.getByText('共 2 張便籤')).toBeInTheDocument();
    });
  });

  it('creates a new note when clicking add button', async () => {
    notesApi.getNotes.mockResolvedValueOnce({ notes: [], total: 0 });
    const newNote = {
      id: 'n-new',
      content: '',
      remark: '',
      pinned: false,
      created_at: '2026-09-12T14:00:00Z',
      updated_at: '2026-09-12T14:00:00Z',
    };
    notesApi.createNote.mockResolvedValueOnce({ note: newNote });

    render(<StickyNotesPage />);

    await waitFor(() => {
      expect(screen.getByText('尚未建立任何便利貼')).toBeInTheDocument();
    });

    const addButtons = screen.getAllByRole('button', { name: /新增便利貼|立即新增第一張便利貼/ });
    fireEvent.click(addButtons[0]);

    await waitFor(() => {
      expect(notesApi.createNote).toHaveBeenCalledWith({ content: '', remark: '', pinned: false });
      expect(screen.getByText('共 1 張便籤')).toBeInTheDocument();
    });
  });

  it('filters notes based on search query', async () => {
    notesApi.getNotes.mockResolvedValueOnce({ notes: mockNotes, total: 2 });

    render(<StickyNotesPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('第一張便利貼內容')).toBeInTheDocument();
      expect(screen.getByDisplayValue('第二張購物清單')).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText('搜尋便利貼');
    fireEvent.change(searchInput, { target: { value: '購物' } });

    await waitFor(() => {
      expect(screen.queryByDisplayValue('第一張便利貼內容')).not.toBeInTheDocument();
      expect(screen.getByDisplayValue('第二張購物清單')).toBeInTheDocument();
      expect(screen.getByText(/符合搜尋 1 張/)).toBeInTheDocument();
    });
  });
});
