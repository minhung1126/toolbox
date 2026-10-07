import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import StickyNotesPage from './StickyNotesPage';
import { notesApi } from '../features/notes/api/notesApi';

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('../features/notes/api/notesApi', () => ({
  isAmbiguousNoteMutation: (error) =>
    ['notes_mutation_invalid', 'timeout', 'network_error'].includes(error?.code) || error?.status >= 500,
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

  it('shows a read error instead of an empty state when the list contract is invalid', async () => {
    notesApi.getNotes.mockRejectedValueOnce(new Error('便利貼清單回應格式不正確。'));
    render(<StickyNotesPage />);

    expect(await screen.findByText('便利貼清單待核對')).toBeInTheDocument();
    expect(screen.queryByText('尚未建立任何便利貼')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新增便利貼' })).toBeDisabled();
  });

  it('reloads after an ambiguous create response before allowing another create', async () => {
    notesApi.getNotes.mockResolvedValueOnce({ notes: [], total: 0 }).mockResolvedValueOnce({
      notes: [{ ...mockNotes[0], id: 'created-note' }],
      total: 1,
    });
    notesApi.createNote.mockRejectedValueOnce({
      code: 'notes_mutation_invalid',
      message: '回應缺少新增便利貼',
    });
    render(<StickyNotesPage />);

    await screen.findByText('尚未建立任何便利貼');
    fireEvent.click(screen.getByRole('button', { name: '新增便利貼' }));

    expect(await screen.findByText('共 1 張便籤')).toBeInTheDocument();
    expect(notesApi.getNotes).toHaveBeenCalledTimes(2);
    expect(notesApi.createNote).toHaveBeenCalledTimes(1);
    expect(toastMocks.error).toHaveBeenCalledWith(expect.stringContaining('勿直接重送'));
  });
  it('creates a template note with its own type and variable storage', async () => {
    notesApi.getNotes.mockResolvedValueOnce({ notes: [], total: 0 });
    notesApi.createNote.mockImplementationOnce(async (draft) => ({
      note: { ...mockNotes[0], ...draft, id: 'template' },
    }));
    render(<StickyNotesPage />);
    await screen.findByText('尚未建立任何便利貼');
    fireEvent.click(screen.getByRole('button', { name: '新增模板便利貼' }));
    expect(await screen.findByLabelText('模板內容')).toBeInTheDocument();
    expect(notesApi.createNote).toHaveBeenCalledWith({
      content: '',
      remark: '',
      pinned: false,
      note_type: 'template',
      variables: {},
    });
  });

  it('inserts an independent duplicate beside the source', async () => {
    notesApi.getNotes.mockResolvedValueOnce({ notes: mockNotes, total: 2 });
    notesApi.createNote.mockImplementationOnce(async (draft) => ({ note: { ...mockNotes[0], ...draft, id: 'copy' } }));
    notesApi.updateNote.mockImplementation(async (id, draft) => ({ note: { ...mockNotes[0], ...draft, id } }));
    const { container } = render(<StickyNotesPage />);
    await screen.findByDisplayValue('第一張便利貼內容');
    fireEvent.click(screen.getAllByRole('button', { name: '建立副本' })[0]);
    await screen.findByText('共 3 張便籤');
    expect([...container.querySelectorAll('[data-note-id]')].map((card) => card.dataset.noteId)).toEqual([
      'n1',
      'copy',
      'n2',
    ]);
    const contents = screen.getAllByDisplayValue('第一張便利貼內容');
    fireEvent.change(contents[1], { target: { value: '副本獨立修改' } });
    expect(contents[0]).toHaveValue('第一張便利貼內容');
  });
});
