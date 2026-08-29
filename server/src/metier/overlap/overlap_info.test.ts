import { expect, test } from 'vitest';

import { computeOverlapInfo } from './overlap_info.ts';

test('both widths travel, and they do not say the same thing', () => {
  const info = computeOverlapInfo(
    { start: '2000-06-01', end: '2000-06-30' }, // photo — mois entier, 29 jours d'écart
    { start: '2000-06-10', end: '2000-06-16' }, // texte — couvre 6 jours
    'logbook_entry',
  );
  expect(info.rule).toBe('logbook_entry');
  expect(info.photoSpanDays).toBe(29);
  expect(info.textSpanDays).toBe(6);
  expect(info.totalSpanDays).toBe(info.photoSpanDays + info.textSpanDays);
});

test('a photo dated to the exact day has ZERO span — nothing ignored about it', () => {
  const info = computeOverlapInfo({ start: '2000-06-10', end: '2000-06-10' }, { start: '2000-06-01', end: '2000-06-30' }, 'passage');
  expect(info.photoSpanDays).toBe(0);
});

test('distanceToCentreDays is the gap between the two midpoints, symmetric either direction', () => {
  const a = computeOverlapInfo({ start: '2000-06-01', end: '2000-06-01' }, { start: '2000-06-11', end: '2000-06-11' }, 'passage');
  expect(a.distanceToCentreDays).toBe(10);

  const b = computeOverlapInfo({ start: '2000-06-11', end: '2000-06-11' }, { start: '2000-06-01', end: '2000-06-01' }, 'passage');
  expect(b.distanceToCentreDays).toBe(10);
});

test('NO width cap — a photo dated to the month against a text covering months apart still returns a real number', () => {
  const info = computeOverlapInfo({ start: '1998-01-01', end: '1998-01-31' }, { start: '1998-06-01', end: '1998-09-08' }, 'web_span');
  expect(info.totalSpanDays).toBeGreaterThan(31);
  expect(Number.isFinite(info.totalSpanDays)).toBe(true);
});

test('the default sort key IS totalSpanDays, ascending, over a set of results', () => {
  const infos = [
    computeOverlapInfo({ start: '2000-01-01', end: '2000-01-01' }, { start: '2000-06-01', end: '2000-06-30' }, 'passage'),
    computeOverlapInfo({ start: '2000-01-01', end: '2000-01-01' }, { start: '2000-01-02', end: '2000-01-02' }, 'passage'),
  ];
  const sums = infos.map((i) => i.totalSpanDays);
  expect([...sums].sort((a, b) => a - b)).toEqual([sums[1], sums[0]]);
});
