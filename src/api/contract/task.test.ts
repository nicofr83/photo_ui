import { TaskNoteCreateInputSchema, TaskNoteSchema } from './task';

const note = {
  id: 'note_01', title: 'Titre', text: 'Corps',
  createdAt: '2026-08-30T10:00:00.000Z', updatedAt: '2026-08-30T10:00:00.000Z',
  attachedTo: { images: [], texts: [] },
};

describe('v1.5 — TaskNote.derivedFrom and editedSince', () => {
  test('a note written from scratch has no derivedFrom, and editedSince is false', () => {
    const parsed = TaskNoteSchema.parse({ ...note, derivedFrom: null, editedSince: false });
    expect(parsed.derivedFrom).toBeNull();
    expect(parsed.editedSince).toBe(false);
  });

  test('a note derived from a passage names it, and can be marked edited since', () => {
    const parsed = TaskNoteSchema.parse({
      ...note,
      derivedFrom: { kind: 'passage', id: 'logbook/p003/001' },
      editedSince: true,
    });
    expect(parsed.derivedFrom).toEqual({ kind: 'passage', id: 'logbook/p003/001' });
    expect(parsed.editedSince).toBe(true);
  });

  test('TaskNoteCreateInput accepts an optional derivedFrom', () => {
    const parsed = TaskNoteCreateInputSchema.parse({
      title: 'Titre', text: 'Corps', attachedTo: { images: [], texts: [] },
      derivedFrom: { kind: 'log_entry', id: 'logbook/p003/002' },
    });
    expect(parsed.derivedFrom).toEqual({ kind: 'log_entry', id: 'logbook/p003/002' });
  });

  test('TaskNoteCreateInput without derivedFrom is still valid — a note written from scratch', () => {
    const parsed = TaskNoteCreateInputSchema.parse({
      title: 'Titre', text: 'Corps', attachedTo: { images: [], texts: [] },
    });
    expect(parsed.derivedFrom).toBeUndefined();
  });
});
