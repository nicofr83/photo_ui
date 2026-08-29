// @vitest-environment jsdom
//
// This file's project (`domain`, vitest.config.ts) runs under Node, which has
// no `localStorage`. Overridden per-file rather than moved: the module is
// pure domain logic, colocated with its test like everything else here — it
// only NEEDS a DOM to exist for the storage global, nothing about its logic
// is jsdom-specific.
import { clearDraft, readDraft, writeDraft } from './noteDraft';

beforeEach(() => { localStorage.clear(); });

describe('spec §5.5 — a note draft survives the client, until it is saved or cleared', () => {
  test('an empty draft reads back as empty text, not null', () => {
    expect(readDraft('1999-transat')).toEqual({ title: '', text: '' });
  });

  test('a written draft round-trips', () => {
    writeDraft('1999-transat', { title: 'Rappel', text: 'vérifier la date du 12' });
    expect(readDraft('1999-transat')).toEqual({ title: 'Rappel', text: 'vérifier la date du 12' });
  });

  test('drafts are scoped per task — spec §5.5, a note is always attached to a task', () => {
    writeDraft('1999-transat', { title: 'A', text: 'a' });
    expect(readDraft('2000-venezuela')).toEqual({ title: '', text: '' });
  });

  test('clearing removes it, the next read is empty again', () => {
    writeDraft('1999-transat', { title: 'A', text: 'a' });
    clearDraft('1999-transat');
    expect(readDraft('1999-transat')).toEqual({ title: '', text: '' });
  });

  test('a corrupted stored value is treated as no draft, never a crash', () => {
    localStorage.setItem('photo_ui:note-draft:1999-transat', '{not json');
    expect(readDraft('1999-transat')).toEqual({ title: '', text: '' });
  });

  test('valid JSON that is not shaped like a draft is also treated as none', () => {
    localStorage.setItem('photo_ui:note-draft:1999-transat', JSON.stringify({ foo: 'bar' }));
    expect(readDraft('1999-transat')).toEqual({ title: '', text: '' });
  });
});
