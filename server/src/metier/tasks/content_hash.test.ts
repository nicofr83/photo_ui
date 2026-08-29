import { expect, test } from 'vitest';

import { contentHash, type TaskContent } from './content_hash.ts';

const img1 = { cloudAssetId: 'a'.repeat(32), order: 0, note: null, selectedBecause: ['album'] };
const img2 = { cloudAssetId: 'b'.repeat(32), order: 1, note: null, selectedBecause: ['manual'] };

const task: TaskContent = {
  title: 'La transat',
  brief: 'Un texte pour Instagram',
  period: { from: '1999-09-01', to: '1999-10-31' },
  images: [img1, img2],
  texts: [{ ref: { kind: 'passage', id: 'transat/001' }, order: 0, startOffset: null, endOffset: null }],
  notes: [{ title: 'Barre', text: 'Hugo à la barre', attachedToImages: [], attachedToTexts: [] }],
};

test('the hash covers what LEAVES, and excludes every timestamp — TaskContent carries none', () => {
  // TaskContent n'a NI exportedAt NI updatedAt : l'exclusion est structurelle,
  // pas un filtre qu'on pourrait oublier d'appliquer.
  const a = contentHash(task);
  const b = contentHash(structuredClone(task));
  expect(a).toBe(b);
});

test('reordering the images changes the hash — the order is what the LLM reads', () => {
  expect(contentHash({ ...task, images: [img1, img2] }))
    .not.toBe(contentHash({ ...task, images: [img2, img1] }));
});

test('a note, a brief or a period changes the hash', () => {
  expect(contentHash({ ...task, brief: 'autre' })).not.toBe(contentHash(task));
  expect(contentHash({ ...task, period: { from: '1999-01-01', to: '1999-12-31' } }))
    .not.toBe(contentHash(task));
  expect(contentHash({ ...task, notes: [] })).not.toBe(contentHash(task));
});

test('selected_because is SORTED before hashing — Postgres guarantees no array order', () => {
  const withOrder1 = { ...task, images: [{ ...img1, selectedBecause: ['album', 'manual'] }] };
  const withOrder2 = { ...task, images: [{ ...img1, selectedBecause: ['manual', 'album'] }] };
  expect(contentHash(withOrder1)).toBe(contentHash(withOrder2));
});

test('a different title changes the hash', () => {
  expect(contentHash({ ...task, title: 'Autre titre' })).not.toBe(contentHash(task));
});

test('two calls on the SAME content are byte-identical, not just structurally equal', () => {
  expect(contentHash(task)).toBe(contentHash(task));
});
