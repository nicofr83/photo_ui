import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'vitest';

import { readAnnotations } from './read_annotations.ts';

async function fixture(lines: string[]): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'annot-'));
  await writeFile(path.join(dir, 'annotations.jsonl'), lines.join('\n') + '\n');
  return dir;
}
const id = (c: string): string => c.repeat(32);

test('keeps only kind=dating on a photo target', async () => {
  const dir = await fixture([
    JSON.stringify({ id: '1', at: '2026-08-28T13:13:10.077Z', kind: 'dating',
                     target: { type: 'photo', id: id('a') }, value: { date: '1999-03-02' } }),
    JSON.stringify({ id: '2', at: '2026-08-28T13:13:11.000Z', kind: 'correction',
                     target: { type: 'passage', id: 'ma-vie/p007/002' }, value: { text: 'x' } }),
  ]);
  const dated = await readAnnotations(dir);
  expect(dated.get(id('a'))).toBe('1999-03-02');
  expect(dated.size).toBe(1);
});

test('a photo dated twice keeps the LATEST — one really is, upstream', async () => {
  const dir = await fixture([
    JSON.stringify({ id: '1', at: '2026-08-28T13:00:00.000Z', kind: 'dating',
                     target: { type: 'photo', id: id('b') }, value: { date: '1999-03-02' } }),
    JSON.stringify({ id: '2', at: '2026-08-28T14:00:00.000Z', kind: 'dating',
                     target: { type: 'photo', id: id('b') }, value: { date: '1999-04-11' } }),
  ]);
  expect((await readAnnotations(dir)).get(id('b'))).toBe('1999-04-11');
});

test('a photo dated twice on the SAME timestamp keeps the later line in file order', async () => {
  const dir = await fixture([
    JSON.stringify({ id: '1', at: '2026-08-28T13:00:00.000Z', kind: 'dating',
                     target: { type: 'photo', id: id('e') }, value: { date: '1999-03-02' } }),
    JSON.stringify({ id: '2', at: '2026-08-28T13:00:00.000Z', kind: 'dating',
                     target: { type: 'photo', id: id('e') }, value: { date: '1999-04-11' } }),
  ]);
  expect((await readAnnotations(dir)).get(id('e'))).toBe('1999-04-11');
});

test('a malformed line fails the import, naming file and line', async () => {
  const dir = await fixture(['{ not json']);
  await expect(readAnnotations(dir)).rejects.toThrow(/annotations\.jsonl:1/);
});

test('an empty line is skipped, not treated as malformed', async () => {
  const dir = await fixture(['', JSON.stringify({ id: '1', at: '2026-08-28T13:00:00.000Z',
    kind: 'dating', target: { type: 'photo', id: id('c') }, value: { date: '2001-12-16' } }), '']);
  expect((await readAnnotations(dir)).size).toBe(1);
});

test('a line missing a required field is skipped, not treated as a dated photo', async () => {
  const dir = await fixture([
    JSON.stringify({ id: '1', at: '2026-08-28T13:00:00.000Z', kind: 'dating',
                     target: { type: 'photo', id: id('d') } }),   // pas de value.date
  ]);
  expect((await readAnnotations(dir)).size).toBe(0);
});

test('only .jsonl files are read, and several files merge together', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'annot-'));
  await writeFile(path.join(dir, '2026-08-28.jsonl'), JSON.stringify({
    id: '1', at: '2026-08-28T13:00:00.000Z', kind: 'dating',
    target: { type: 'photo', id: id('f') }, value: { date: '2000-01-01' },
  }) + '\n');
  await writeFile(path.join(dir, 'README.md'), 'pas une annotation');
  const dated = await readAnnotations(dir);
  expect(dated.get(id('f'))).toBe('2000-01-01');
  expect(dated.size).toBe(1);
});
