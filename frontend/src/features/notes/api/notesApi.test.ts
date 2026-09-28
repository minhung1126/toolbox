import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../services/api';
import { isAmbiguousNoteMutation, NotesContractError, notesApi } from './notesApi';

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

  const note = {
    id: 'note-1',
    content: 'Draft',
    remark: 'Review',
    pinned: false,
    created_at: '2026-09-24T00:00:00Z',
    updated_at: '2026-09-24T00:00:00Z',
  };

  it.each([
    { notes: [note], total: 2 },
    { notes: [{ ...note, pinned: 'false' }], total: 1 },
    { notes: [note, note], total: 2 },
    { notes: undefined, total: 0 },
  ])('rejects malformed or inconsistent lists: %j', async (response) => {
    vi.mocked(api.getNotes).mockResolvedValue(response as Awaited<ReturnType<typeof api.getNotes>>);
    await expect(notesApi.getNotes()).rejects.toMatchObject({ code: 'notes_list_invalid' });
  });

  it('checks mutation status, note identity, and delete confirmation', async () => {
    vi.mocked(api.createNote).mockResolvedValue({ note } as Awaited<ReturnType<typeof api.createNote>>);
    await expect(notesApi.createNote()).rejects.toBeInstanceOf(NotesContractError);

    vi.mocked(api.getNote).mockResolvedValue({ note: { ...note, id: 'other-note' } });
    await expect(notesApi.getNote(note.id)).rejects.toMatchObject({ code: 'notes_mutation_invalid' });

    vi.mocked(api.updateNote).mockResolvedValue({ note: { ...note, id: 'other-note' }, status: 'updated' });
    await expect(notesApi.updateNote(note.id, { pinned: true })).rejects.toMatchObject({
      code: 'notes_mutation_invalid',
    });

    vi.mocked(api.deleteNote).mockResolvedValue({ deleted: true, note_id: 'other-note' });
    await expect(notesApi.deleteNote(note.id)).rejects.toMatchObject({ code: 'notes_mutation_invalid' });
  });

  it('marks uncertain transport and mutation-contract failures for reconciliation', () => {
    expect(isAmbiguousNoteMutation({ code: 'notes_mutation_invalid' })).toBe(true);
    expect(isAmbiguousNoteMutation({ code: 'timeout' })).toBe(true);
    expect(isAmbiguousNoteMutation({ status: 503 })).toBe(true);
    expect(isAmbiguousNoteMutation({ status: 422 })).toBe(false);
  });
});
