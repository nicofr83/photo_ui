import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, test } from 'vitest';

import { isAllowedAssetExtension, isValidPageId, labelFromPageId, resolveUnderRoot } from './web_site_path.ts';

test('isValidPageId accepts exactly the real 5-page pattern, nothing else', () => {
  expect(isValidPageId('1998-1999.htm')).toBe(true);
  expect(isValidPageId('1900-1988.html')).toBe(true);
  expect(isValidPageId('../../../etc/passwd')).toBe(false);
  expect(isValidPageId('1998-1999.php')).toBe(false);
  expect(isValidPageId('1998-1999.htm/../../../etc/passwd')).toBe(false);
  expect(isValidPageId('index.htm')).toBe(false);
  expect(isValidPageId('1998-1999')).toBe(false);
  expect(isValidPageId('abcd-1999.htm')).toBe(false);
  expect(isValidPageId('1998-1999.htm\0.gif')).toBe(false);
});

test('labelFromPageId is the two years from the FILENAME, never the <title> — they can differ', () => {
  // Mesuré sur le corpus réel : 1900-1988.htm porte <title>1958-1998</title>,
  // une relecture narrative distincte de son nom de fichier.
  expect(labelFromPageId('1900-1988.htm')).toBe('1900-1988');
  expect(labelFromPageId('1998-1999.html')).toBe('1998-1999');
  expect(labelFromPageId('not-a-page-id')).toBeNull();
});

test('isAllowedAssetExtension accepts exactly css/gif/jpg/png, nothing else', () => {
  expect(isAllowedAssetExtension('_themes/x/funf1011.css')).toBe(true);
  expect(isAllowedAssetExtension('_derived/x_bnr.gif')).toBe(true);
  expect(isAllowedAssetExtension('images/a.jpg')).toBe(true);
  expect(isAllowedAssetExtension('images/a.png')).toBe(true);
  expect(isAllowedAssetExtension('images/a.PNG')).toBe(true);
  expect(isAllowedAssetExtension('a.jpeg')).toBe(false);
  expect(isAllowedAssetExtension('a.js')).toBe(false);
  expect(isAllowedAssetExtension('a.php')).toBe(false);
  expect(isAllowedAssetExtension('a')).toBe(false);
});

let root = '';
beforeEach(async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'web-site-path-'));
  root = await realpath(base);
  await mkdir(path.join(root, '_themes', 'x'), { recursive: true });
  await writeFile(path.join(root, '1998-1999.htm'), 'x');
  await writeFile(path.join(root, '_themes', 'x', 'funf1011.css'), 'x');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test('resolveUnderRoot returns the real path for a legitimate file under the root', async () => {
  const resolved = await resolveUnderRoot(root, '_themes/x/funf1011.css');
  expect(resolved).toBe(path.join(root, '_themes', 'x', 'funf1011.css'));
});

test('resolveUnderRoot refuses a path-traversal attempt — the point that matters most', async () => {
  await mkdir(path.join(path.dirname(root), 'outside'), { recursive: true });
  await writeFile(path.join(path.dirname(root), 'outside', 'secret.css'), 'x');

  const escaped = await resolveUnderRoot(root, '../outside/secret.css');
  expect(escaped).toBeNull();

  const deepEscape = await resolveUnderRoot(root, '../../../../../../etc/passwd');
  expect(deepEscape).toBeNull();
});

test('resolveUnderRoot refuses a symlink inside the root that points outside it', async () => {
  const outsideDir = path.join(path.dirname(root), 'outside-link-target');
  await mkdir(outsideDir, { recursive: true });
  await writeFile(path.join(outsideDir, 'secret.gif'), 'x');
  await symlink(outsideDir, path.join(root, 'escape'));

  const resolved = await resolveUnderRoot(root, 'escape/secret.gif');
  expect(resolved).toBeNull();
});

test('resolveUnderRoot returns null for a file that does not exist, same as an escape attempt', async () => {
  const resolved = await resolveUnderRoot(root, 'nowhere.css');
  expect(resolved).toBeNull();
});

test('resolveUnderRoot refuses a sibling directory that merely shares the root\'s string prefix', async () => {
  const evilSibling = `${root}-evil`;
  await mkdir(evilSibling, { recursive: true });
  await writeFile(path.join(evilSibling, 'x.css'), 'x');

  // Un chemin relatif ne peut pas viser directement le frère, mais le test
  // documente la garde : `startsWith(root + sep)`, jamais `startsWith(root)` seul.
  const resolved = await resolveUnderRoot(root, `../${path.basename(evilSibling)}/x.css`);
  expect(resolved).toBeNull();
  await rm(evilSibling, { recursive: true, force: true });
});
