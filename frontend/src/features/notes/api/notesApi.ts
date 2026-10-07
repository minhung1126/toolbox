import { api } from '../../../services/api';
import type {
  StickyNote,
  StickyNoteCreatedResponse,
  StickyNoteDeleteResponse,
  StickyNoteResponse,
  StickyNoteUpdatedResponse,
  StickyNotesApi,
  StickyNotesListResponse,
} from './types';

export type * from './types';

export class NotesContractError extends Error {
  code: 'notes_list_invalid' | 'notes_mutation_invalid';

  constructor(message: string, code: 'notes_list_invalid' | 'notes_mutation_invalid') {
    super(message);
    this.code = code;
  }
}

export function isAmbiguousNoteMutation(error: { code?: string; status?: number } | null | undefined): boolean {
  return (
    error?.code === 'notes_mutation_invalid' ||
    error?.code === 'timeout' ||
    error?.code === 'network_error' ||
    (typeof error?.status === 'number' && error.status >= 500)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNote(value: unknown): value is StickyNote {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.trim().length > 0 &&
    typeof value.content === 'string' &&
    typeof value.remark === 'string' &&
    typeof value.pinned === 'boolean' &&
    (value.note_type === undefined || value.note_type === 'plain' || value.note_type === 'template') &&
    (value.variables === undefined ||
      (isRecord(value.variables) && Object.values(value.variables).every((entry) => typeof entry === 'string'))) &&
    typeof value.created_at === 'string' &&
    value.created_at.length > 0 &&
    typeof value.updated_at === 'string' &&
    value.updated_at.length > 0
  );
}

function parseList(value: unknown): StickyNotesListResponse {
  if (
    !isRecord(value) ||
    !Array.isArray(value.notes) ||
    !value.notes.every(isNote) ||
    !Number.isSafeInteger(value.total) ||
    value.total !== value.notes.length ||
    new Set(value.notes.map((note: StickyNote) => note.id)).size !== value.notes.length
  ) {
    throw new NotesContractError('便利貼清單回應格式不正確。', 'notes_list_invalid');
  }
  return value as unknown as StickyNotesListResponse;
}

function parseNote(value: unknown, status?: 'created' | 'updated', noteId?: string): StickyNoteResponse {
  if (
    !isRecord(value) ||
    !isNote(value.note) ||
    (status && value.status !== status) ||
    (noteId && value.note.id !== noteId)
  ) {
    throw new NotesContractError('便利貼寫入回應格式不正確，請先重新整理核對。', 'notes_mutation_invalid');
  }
  return value as unknown as StickyNoteResponse;
}

function parseDelete(value: unknown, noteId: string): StickyNoteDeleteResponse {
  if (!isRecord(value) || value.deleted !== true || value.note_id !== noteId) {
    throw new NotesContractError('便利貼刪除回應格式不正確，請先重新整理核對。', 'notes_mutation_invalid');
  }
  return value as unknown as StickyNoteDeleteResponse;
}

export const notesApi: StickyNotesApi = {
  getNotes: async (query) => parseList(await api.getNotes(query)),
  createNote: async (note) => parseNote(await api.createNote(note), 'created') as StickyNoteCreatedResponse,
  getNote: async (noteId) => parseNote(await api.getNote(noteId), undefined, noteId),
  updateNote: async (noteId, patch) =>
    parseNote(await api.updateNote(noteId, patch), 'updated', noteId) as StickyNoteUpdatedResponse,
  deleteNote: async (noteId) => parseDelete(await api.deleteNote(noteId), noteId),
};
