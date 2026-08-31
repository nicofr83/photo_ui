import { expect, test } from 'vitest';

import { isEditedSince, isQuotable, locatePassagesForSelection, normalizeWhitespace } from './note_provenance.ts';

test('normalizeWhitespace collapses any run of whitespace to one space, trims the ends', () => {
  expect(normalizeWhitespace('a   b\tc\n\nd')).toBe('a b c d');
  expect(normalizeWhitespace('  leading and trailing  ')).toBe('leading and trailing');
  expect(normalizeWhitespace('one line\nper sentence\nlike Ma vie displays it'))
    .toBe('one line per sentence like Ma vie displays it');
});

test('isEditedSince is false with no snapshot — a note written from scratch is never "edited since"', () => {
  expect(isEditedSince('un texte quelconque', null)).toBe(false);
});

test('isEditedSince compares against the SNAPSHOT, whitespace-normalized', () => {
  expect(isEditedSince('Départ de Figueira.', 'Départ de Figueira.')).toBe(false);
  // Ma vie affiche une phrase par ligne — une copie fidèle y arrive avec des
  // retours à la ligne que la page ne contient pas.
  expect(isEditedSince('Départ\nde\nFigueira.', 'Départ de Figueira.')).toBe(false);
  expect(isEditedSince('Départ de Figueira, le matin.', 'Départ de Figueira.')).toBe(true);
});

test('isQuotable is false with no source — nothing to quote against', () => {
  expect(isQuotable('un texte', null)).toBe(false);
});

test('isQuotable is false for an empty or blank note body', () => {
  expect(isQuotable('   ', 'Departure at dawn.')).toBe(false);
  expect(isQuotable('', 'Departure at dawn.')).toBe(false);
});

test('a faithful verbatim copy is quotable', () => {
  expect(isQuotable('Départ de Figueira.', 'Départ de Figueira. Le vent se lève.')).toBe(true);
});

test('truncating a quote keeps it quotable — cutting is an editor\'s gesture', () => {
  expect(isQuotable('Départ de Figueira.', 'Départ de Figueira. Le vent se lève. Nous levons l\'ancre.')).toBe(true);
  // Coupée au DÉBUT aussi — la contiguïté est ce qui compte, pas la position.
  expect(isQuotable('Le vent se lève.', 'Départ de Figueira. Le vent se lève.')).toBe(true);
});

test('rewriting even one word makes it not quotable — an author\'s gesture, not an editor\'s', () => {
  expect(isQuotable('Départ de Lisbonne.', 'Départ de Figueira. Le vent se lève.')).toBe(false);
});

test('the twisted case: an unedited note whose source was corrected since loses quotability on its own', () => {
  // La note garde son instantané ("deux ns"), la source a été corrigée
  // ("deux ris") — aucune règle dédiée, seulement la sous-chaîne qui ne
  // matche plus.
  const noteBody = 'Nous avons vu deux ns dans la baie.';
  const correctedSource = 'Nous avons vu deux ris dans la baie ce matin-là.';
  expect(isEditedSince(noteBody, noteBody)).toBe(false);
  expect(isQuotable(noteBody, correctedSource)).toBe(false);
});

test('editedSince and quotable diverge on a truncated quote — both true, not a contradiction', () => {
  const original = 'Départ de Figueira. Le vent se lève. Nous levons l\'ancre.';
  const truncatedNote = 'Départ de Figueira.';
  expect(isEditedSince(truncatedNote, original)).toBe(true);
  expect(isQuotable(truncatedNote, original)).toBe(true);
});

test('whitespace normalization means a page-concatenated source still matches a selection spanning a join point', () => {
  // Une sélection libre traverse la frontière entre deux passages
  // concaténés — la normalisation des deux côtés doit encore matcher.
  const pageText = normalizeWhitespace('Premier passage.\nDeuxième passage qui suit.');
  expect(isQuotable('passage.\nDeuxième', pageText)).toBe(true);
});

test('locatePassagesForSelection: a selection inside one passage locates only that passage', () => {
  const passages = [
    { kind: 'passage', id: 'p1', text: 'Départ de Figueira.' },
    { kind: 'passage', id: 'p2', text: 'Le vent se lève.' },
    { kind: 'passage', id: 'p3', text: 'Nous levons l\'ancre.' },
  ];
  const located = locatePassagesForSelection('Le vent se lève.', passages);
  expect(located.matched).toBe(true);
  expect(located.refs).toEqual([{ kind: 'passage', id: 'p2' }]);
});

test('locatePassagesForSelection: a selection spanning a join point locates both passages, and only those', () => {
  const passages = [
    { kind: 'passage', id: 'p1', text: 'Premier passage.' },
    { kind: 'passage', id: 'p2', text: 'Deuxième passage qui suit.' },
    { kind: 'passage', id: 'p3', text: 'Troisième, non concerné.' },
  ];
  const located = locatePassagesForSelection('passage.\nDeuxième', passages);
  expect(located.matched).toBe(true);
  expect(located.refs).toEqual([{ kind: 'passage', id: 'p1' }, { kind: 'passage', id: 'p2' }]);
});

test('locatePassagesForSelection: no match — rewritten selection, or source changed since', () => {
  const passages = [{ kind: 'passage', id: 'p1', text: 'Départ de Figueira.' }];
  const located = locatePassagesForSelection('Départ de Lisbonne.', passages);
  expect(located).toEqual({ matched: false, refs: [] });
});

test('locatePassagesForSelection: empty selection never matches', () => {
  const passages = [{ kind: 'passage', id: 'p1', text: 'Départ de Figueira.' }];
  expect(locatePassagesForSelection('   ', passages)).toEqual({ matched: false, refs: [] });
});

test('locatePassagesForSelection: a passage that normalizes to empty is skipped, never an off-by-one on offsets', () => {
  const passages = [
    { kind: 'passage', id: 'p1', text: 'Premier.' },
    { kind: 'passage', id: 'p2', text: '   ' },
    { kind: 'passage', id: 'p3', text: 'Troisième.' },
  ];
  const located = locatePassagesForSelection('Troisième.', passages);
  expect(located.matched).toBe(true);
  expect(located.refs).toEqual([{ kind: 'passage', id: 'p3' }]);
});
