import { TaskNoteCreateInputSchema, TaskNoteSchema } from './task';

const note = {
  id: 'note_01', title: 'Titre', text: 'Corps',
  createdAt: '2026-08-30T10:00:00.000Z', updatedAt: '2026-08-30T10:00:00.000Z',
  attachedTo: { images: [], texts: [] },
};

describe('v1.5 — TaskNote.derivedFrom and editedSince', () => {
  test('a note written from scratch has no derivedFrom, and editedSince is false', () => {
    const parsed = TaskNoteSchema.parse({
      ...note, derivedFrom: null, editedSince: false, quotable: false,
    });
    expect(parsed.derivedFrom).toBeNull();
    expect(parsed.editedSince).toBe(false);
  });

  test('a note derived from a passage names it, with its snapshot, and can be marked edited since', () => {
    const parsed = TaskNoteSchema.parse({
      ...note,
      derivedFrom: { kind: 'passage', id: 'logbook/p003/001', text: 'Mouillage devant Porlamar.' },
      editedSince: true,
      quotable: false,
    });
    expect(parsed.derivedFrom).toEqual({
      kind: 'passage', id: 'logbook/p003/001', text: 'Mouillage devant Porlamar.',
    });
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

describe('V1.7, "la règle capitale" — quotable, always present, never stored by the client', () => {
  test('a note written from scratch is never quotable as a period voice', () => {
    const parsed = TaskNoteSchema.parse({
      ...note, derivedFrom: null, editedSince: false, quotable: false,
    });
    expect(parsed.quotable).toBe(false);
  });

  test('a faithful excerpt is quotable', () => {
    const parsed = TaskNoteSchema.parse({
      ...note,
      derivedFrom: { kind: 'passage', id: 'logbook/p003/001', text: 'Mouillage devant Porlamar.' },
      editedSince: false,
      quotable: true,
    });
    expect(parsed.quotable).toBe(true);
  });

  test('quotable is required — a response that omits it breaks the contract', () => {
    expect(() => TaskNoteSchema.parse({ ...note, derivedFrom: null, editedSince: false })).toThrow();
  });
});

describe('V1.7 — derivedFrom accepts a whole PAGE, the only new vocabulary of 1.7', () => {
  test('a free selection on "Ma vie" or the web names a page, not a passage', () => {
    const parsed = TaskNoteSchema.parse({
      ...note,
      derivedFrom: { kind: 'page', id: 'ma-vie/p007', text: 'Le récit de la page entière.' },
      editedSince: false,
      quotable: true,
    });
    expect(parsed.derivedFrom).toEqual({ kind: 'page', id: 'ma-vie/p007', text: 'Le récit de la page entière.' });
  });

  test('TaskNoteCreateInput accepts a page ref too — {kind, id}, never a text snapshot', () => {
    const parsed = TaskNoteCreateInputSchema.parse({
      title: 'Titre', text: 'Corps', attachedTo: { images: [], texts: [] },
      derivedFrom: { kind: 'page', id: 'ma-vie/p007' },
    });
    expect(parsed.derivedFrom).toEqual({ kind: 'page', id: 'ma-vie/p007' });
  });

  test('the client never posts the original text — a snapshot on the input is refused', () => {
    // Team-lead's warning: "si tu te surprends à poster un text_original... tu
    // casses la garantie". `strictObject` refuses the extra key outright.
    expect(() =>
      TaskNoteCreateInputSchema.parse({
        title: 'Titre', text: 'Corps', attachedTo: { images: [], texts: [] },
        derivedFrom: { kind: 'page', id: 'ma-vie/p007', text: 'Ce que le client croit être la source.' },
      }),
    ).toThrow();
  });
});
