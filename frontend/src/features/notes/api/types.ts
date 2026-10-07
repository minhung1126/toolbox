export interface StickyNote {
  id: string;
  content: string;
  remark: string;
  pinned: boolean;
  note_type?: 'plain' | 'template';
  variables?: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export type StickyNoteDraft = Partial<Pick<StickyNote, 'content' | 'remark' | 'pinned' | 'note_type' | 'variables'>>;

export interface StickyNotesListResponse {
  notes: StickyNote[];
  total: number;
}

export interface StickyNoteResponse {
  note: StickyNote;
}

export interface StickyNoteCreatedResponse extends StickyNoteResponse {
  status: 'created';
}

export interface StickyNoteUpdatedResponse extends StickyNoteResponse {
  status: 'updated';
}

export interface StickyNoteDeleteResponse {
  deleted: true;
  note_id: string;
}

export interface StickyNotesApi {
  getNotes(query?: string): Promise<StickyNotesListResponse>;
  createNote(note?: StickyNoteDraft): Promise<StickyNoteCreatedResponse>;
  getNote(noteId: string): Promise<StickyNoteResponse>;
  updateNote(noteId: string, patch?: StickyNoteDraft): Promise<StickyNoteUpdatedResponse>;
  deleteNote(noteId: string): Promise<StickyNoteDeleteResponse>;
}
