import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../services/api';
import { notesApi } from './notesApi';

vi.mock('../../../services/api', () => ({
  api: {
    getNotes: vi.fn(),
    createNote: vi.fn(),
    getNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
  },
}));

describe('notesApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forwards list, create, update, and delete requests through the shared client', async () => {
    const note = {
      id: 'note-1',
      content: 'Draft',
      remark: 'Review',
      pinned: false,
      created_at: '2026-09-24T00:00:00Z',
      updated_at: '2026-09-24T00:00:00Z',
    };
    api.getNotes.mockResolvedValue({ notes: [note], total: 1 });
    api.createNote.mockResolvedValue({ note, status: 'created' });
    api.updateNote.mockResolvedValue({ note, status: 'updated' });
    api.deleteNote.mockResolvedValue({ deleted: true, note_id: note.id });

    await expect(notesApi.getNotes('Draft')).resolves.toEqual({ notes: [note], total: 1 });
    await expect(notesApi.createNote({ content: 'Draft' })).resolves.toMatchObject({ status: 'created' });
    await expect(notesApi.updateNote(note.id, { pinned: true })).resolves.toMatchObject({ status: 'updated' });
    await expect(notesApi.deleteNote(note.id)).resolves.toEqual({ deleted: true, note_id: note.id });

    expect(api.getNotes).toHaveBeenCalledWith('Draft');
    expect(api.createNote).toHaveBeenCalledWith({ content: 'Draft' });
    expect(api.updateNote).toHaveBeenCalledWith(note.id, { pinned: true });
    expect(api.deleteNote).toHaveBeenCalledWith(note.id);
  });
});
