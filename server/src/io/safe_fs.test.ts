import { mkdir, mkdtemp, readdir, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, test } from 'vitest';

import { createLog, LogLevel } from '../log/log.ts';
import { createSafeFs, type SafeFs } from './safe_fs.ts';

let cacheRoot: string;
let originalsRoot: string;
let safeFs: SafeFs;

beforeEach(async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'safefs-'));
  cacheRoot = path.join(base, 'cache');
  originalsRoot = path.join(base, 'originals');
  await mkdir(cacheRoot);
  await mkdir(originalsRoot);
  safeFs = await createSafeFs([cacheRoot], createLog(LogLevel.ERROR, {}, () => undefined));
});

describe('what is allowed', () => {
  test('a path inside a writable root', () => {
    expect(() => { safeFs.assertWritable(path.join(cacheRoot, 'abc-1400.jpg')); }).not.toThrow();
  });

  test('a nested path inside a writable root', () => {
    expect(() => { safeFs.assertWritable(path.join(cacheRoot, 'a', 'b', 'c.jpg')); }).not.toThrow();
  });

  test('the root itself', () => {
    expect(() => { safeFs.assertWritable(cacheRoot); }).not.toThrow();
  });

  test('and writing actually works', async () => {
    await safeFs.writeFile(path.join(cacheRoot, 'rendu.jpg'), 'des octets');
    expect(await readdir(cacheRoot)).toEqual(['rendu.jpg']);
  });
});

describe('what is refused', () => {
  test('a path outside every writable root', () => {
    expect(() => { safeFs.assertWritable(path.join(originalsRoot, 'photo.jpg')); })
      .toThrow(/écriture refusée hors racine/);
  });

  test('a traversal that climbs out of the root', () => {
    expect(() => { safeFs.assertWritable(path.join(cacheRoot, '..', 'originals', 'photo.jpg')); })
      .toThrow(/écriture refusée hors racine/);
  });

  test('a SIBLING whose name merely starts with the root — the startsWith trap', () => {
    // `/tmp/x/cache-evil` commence bien par `/tmp/x/cache`. Sans le séparateur
    // dans la comparaison, il passerait.
    expect(() => { safeFs.assertWritable(`${cacheRoot}-evil/x.jpg`); })
      .toThrow(/écriture refusée hors racine/);
  });

  test('a symlink inside the root that RESOLVES outside it', async () => {
    await writeFile(path.join(originalsRoot, 'real.jpg'), 'original intouchable');
    await symlink(originalsRoot, path.join(cacheRoot, 'escape'));

    // `path.resolve` seul ne l'attrape pas : le chemin est lexicalement dedans.
    await expect(safeFs.writeFile(path.join(cacheRoot, 'escape', 'real.jpg'), 'écrasé'))
      .rejects.toThrow(/écriture refusée hors racine/);
  });

  test('the refusal names the offending path, so a log says WHICH write was blocked', () => {
    const target = path.join(originalsRoot, 'photo.jpg');
    expect(() => { safeFs.assertWritable(target); }).toThrow(new RegExp(target.replace(/\//g, '\\/')));
  });
});

describe('every write path goes through the checkpoint', () => {
  test('mkdir refuses outside', async () => {
    await expect(safeFs.mkdir(path.join(originalsRoot, 'nouveau')))
      .rejects.toThrow(/écriture refusée hors racine/);
  });

  test('rename refuses when EITHER side is outside', async () => {
    await safeFs.writeFile(path.join(cacheRoot, 'a.jpg'), 'x');
    await expect(safeFs.rename(path.join(cacheRoot, 'a.jpg'), path.join(originalsRoot, 'a.jpg')))
      .rejects.toThrow(/écriture refusée hors racine/);
    await expect(safeFs.rename(path.join(originalsRoot, 'real.jpg'), path.join(cacheRoot, 'b.jpg')))
      .rejects.toThrow(/écriture refusée hors racine/);
  });

  test('rm refuses outside — the originals volume is never deleted from', async () => {
    await expect(safeFs.rm(originalsRoot)).rejects.toThrow(/écriture refusée hors racine/);
  });

  test('createWriteStream refuses outside', () => {
    expect(() => safeFs.createWriteStream(path.join(originalsRoot, 'x.jpg')))
      .toThrow(/écriture refusée hors racine/);
  });
});

describe('the roots themselves', () => {
  test('a symlinked ROOT works, through the configured path and the canonical one', async () => {
    const base = await mkdtemp(path.join(tmpdir(), 'safefs-link-'));
    const real = path.join(base, 'real-cache');
    const link = path.join(base, 'link-cache');
    await mkdir(real);
    await symlink(real, link);

    const viaLink = await createSafeFs([link], createLog(LogLevel.ERROR, {}, () => undefined));

    // Le chemin CONFIGURÉ — celui que la variable d'environnement porte.
    await viaLink.writeFile(path.join(link, 'x.jpg'), 'x');
    // Et la forme CANONIQUE de la racine, celle que `realpath` rend.
    const canonical = await realpath(link);
    await viaLink.writeFile(path.join(canonical, 'y.jpg'), 'y');

    expect((await readdir(real)).sort()).toEqual(['x.jpg', 'y.jpg']);
  });

  test('a missing writable root is refused at construction, naming it', async () => {
    await expect(createSafeFs(['/nowhere/at/all'], createLog(LogLevel.ERROR, {}, () => undefined)))
      .rejects.toThrow(/nowhere/);
  });
});
