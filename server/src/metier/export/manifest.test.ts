import { expect, test } from 'vitest';

import { buildManifest, type ManifestInput } from './manifest.ts';

const img1 = {
  cloudAssetId: 'a'.repeat(32), sha256: 'b'.repeat(64), albumPath: 'set/x', groupName: 'x',
  date: { start: '1999-10-14', end: '1999-10-14', precision: 'day', kind: 'decision', source: 'annotation', bracketHours: null },
  position: null, people: [], place: { city: null, country: null }, userNote: null, caption: null,
  selectedBecause: ['date_range'],
};

const passageWithDate = {
  id: 'logbook/p021/004', kind: 'log_entry', document: 'logbook', page: 'logbook/p021',
  text: 'Départ à cinq heures', textOriginal: 'Depart a cinq heures', corrected: true,
  date: { start: '1999-10-14', end: '1999-10-14', precision: 'day', kind: 'reading', source: 'log_entry_date', bracketHours: null },
  overlap: { from: '1999-10-14', to: '1999-10-16', rule: 'passage', spanSource: null },
  coversImages: [img1.cloudAssetId], userNote: null,
};

const undatedText = {
  ...passageWithDate, id: 'ma-vie/p007/002', document: 'ma-vie', page: 'ma-vie/p007', date: null, corrected: false,
  textOriginal: null,
};

const task: ManifestInput = {
  task: { slug: '1999-transat', title: 'La transat', brief: 'Un texte pour Instagram', period: null, createdAt: 'c', exportedAt: 'e' },
  images: [img1],
  texts: [passageWithDate],
  notes: [],
};

test('the manifest carries the contract vocabulary, snake_cased and nothing else', () => {
  const m = buildManifest(task);
  expect(m.images[0]?.date?.source).toBe('annotation');
  expect(m.images[0]?.selected_because).toEqual(['date_range']);
  expect(m.texts[0]?.overlap?.rule).toBe('passage');
});

test('a text date has the SAME six keys as an image date — start/end, and a precision', () => {
  const m = buildManifest(task);
  expect(Object.keys(m.texts[0]?.date ?? {}).sort())
    .toEqual(['bracket_hours', 'end', 'kind', 'precision', 'source', 'start']);
  expect(Object.keys(m.images[0]?.date ?? {}).sort())
    .toEqual(['bracket_hours', 'end', 'kind', 'precision', 'source', 'start']);
});

test('a text with no date carries null — the normal case, over a third of them', () => {
  const m = buildManifest({ ...task, texts: [undatedText] });
  expect(m.texts[0]?.date).toBeNull();
});

test('overlap keeps from/to — it asserts nothing, and the shape says so', () => {
  const m = buildManifest(task);
  expect(Object.keys(m.texts[0]?.overlap ?? {}).sort()).toEqual(['from', 'rule', 'span_source', 'to']);
});

test('a corrected text carries BOTH text and text_original — a correction never destroys the transcription', () => {
  const m = buildManifest(task);
  expect(m.texts[0]?.text).toBe('Départ à cinq heures');
  expect(m.texts[0]?.text_original).toBe('Depart a cinq heures');
});

test('an uncorrected text has text_original null, never a duplicate of text', () => {
  const m = buildManifest({ ...task, texts: [undatedText] });
  expect(m.texts[0]?.text_original).toBeNull();
});

test('page_image is derived from the page id — pageId/NNN becomes pages/pageId-NNN.jpg, mechanically', () => {
  const m = buildManifest(task);
  expect(m.texts[0]?.page_image).toBe('pages/logbook-p021.jpg');
});

test('a text with no page (the web has none, D9) carries a null page_image, never a guessed one', () => {
  const webText = { ...passageWithDate, page: null };
  const m = buildManifest({ ...task, texts: [webText] });
  expect(m.texts[0]?.page).toBeNull();
  expect(m.texts[0]?.page_image).toBeNull();
});

test('an image file path is images/<cloud_asset_id>.jpg, matching what export_service actually writes', () => {
  const m = buildManifest(task);
  expect(m.images[0]?.file).toBe(`images/${img1.cloudAssetId}.jpg`);
});

test('caption is machine-only, never present in texts or notes — always null today, the captioning pass has never run', () => {
  const m = buildManifest(task);
  expect(m.images[0]?.caption).toBeNull();
});

test('a note with an empty attachment on both sides is a GENERAL note, not an error', () => {
  const generalNote = {
    id: 'note_01', createdAt: 'c', title: 'Ce que le journal ne dit pas', text: 'x',
    attachedToImages: [], attachedToTexts: [],
  };
  const m = buildManifest({ ...task, notes: [generalNote] });
  expect(m.notes[0]?.attached_to).toEqual({ images: [], texts: [] });
});

test('schema_version is present and equal to 1', () => {
  expect(buildManifest(task).schema_version).toBe(1);
});
