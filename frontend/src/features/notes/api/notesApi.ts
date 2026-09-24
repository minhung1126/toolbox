import { api } from '../../../services/api';
import type { StickyNotesApi } from './types';

export type * from './types';

export const notesApi: StickyNotesApi = {
  getNotes: (query) => api.getNotes(query),
  createNote: (note) => api.createNote(note),
  getNote: (noteId) => api.getNote(noteId),
  updateNote: (noteId, patch) => api.updateNote(noteId, patch),
  deleteNote: (noteId) => api.deleteNote(noteId),
};
