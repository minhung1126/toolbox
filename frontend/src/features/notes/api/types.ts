export interface StickyNote {
  id: string;
  content: string;
  remark: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export type StickyNoteDraft = Partial<Pick<StickyNote, 'content' | 'remark' | 'pinned'>>;

export interface StickyNotesListResponse {
  notes: StickyNote[];
  total: number;
}

export interface StickyNoteResponse {
  note: StickyNote;
  status?: 'created' | 'updated';
}

export interface StickyNoteDeleteResponse {
  deleted: true;
  note_id: string;
}

export interface StickyNotesApi {
  getNotes(query?: string): Promise<StickyNotesListResponse>;
  createNote(note?: StickyNoteDraft): Promise<StickyNoteResponse>;
  getNote(noteId: string): Promise<StickyNoteResponse>;
  updateNote(noteId: string, patch?: StickyNoteDraft): Promise<StickyNoteResponse>;
  deleteNote(noteId: string): Promise<StickyNoteDeleteResponse>;
}
