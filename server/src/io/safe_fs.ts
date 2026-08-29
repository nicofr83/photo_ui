import { createWriteStream as nodeCreateWriteStream, type WriteStream } from 'node:fs';
import { mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ErrorCode } from '@shared/enums';
import { AppError } from '../contract/error_interface.ts';
import type { Log } from '../log/log.ts';

/**
 * LE point de contrôle des écritures disque. Toute écriture du serveur passe
 * par ici, et rien d'autre n'appelle `fs` en écriture.
 *
 * Ce n'est pas une ceinture de sécurité décorative : c'est ce qui rend
 * TESTABLE — et pas seulement relisible — la règle « on n'écrit jamais sur le
 * volume des originaux, caches compris ».
 */
export interface SafeFs {
  /** Contrôle LEXICAL, synchrone. Suffisant quand le chemin n'existe pas encore. */
  assertWritable(target: string): void;
  writeFile(target: string, data: string | Uint8Array): Promise<void>;
  mkdir(target: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  rm(target: string): Promise<void>;
  createWriteStream(target: string): WriteStream;
}

export async function createSafeFs(
  writableRoots: readonly string[],
  log: Log,
): Promise<SafeFs> {
  // Canonicalisées AU DÉMARRAGE : un lien symbolique dans la racine elle-même
  // rendrait toute comparaison de préfixe fausse par la suite. `realpath` lève
  // en nommant la racine si elle n'existe pas — c'est le refus de démarrer.
  const canonicalRoots = await Promise.all(writableRoots.map((root) => realpath(root)));

  // Une racine CONFIGURÉE peut légitimement passer par un lien : sur macOS
  // `/var` est un lien vers `/private/var`, donc tout ce qui vit sous
  // `/var/folders/...` a deux écritures valides. On accepte les deux formes en
  // contrôle lexical ; le contrôle qui fait autorité reste `realpath`, plus bas,
  // et lui n'admet que la forme canonique.
  const lexicalRoots = [...new Set([
    ...writableRoots.map((root) => path.resolve(root)),
    ...canonicalRoots,
  ])];
  log.info('racines inscriptibles', { canonicalRoots, lexicalRoots });

  const refuse = (target: string): never => {
    throw new AppError(
      ErrorCode.INTERNAL,
      `écriture refusée hors racine : ${target}`,
      500,
      { traceId: 'safe-fs' },
    );
  };

  // Le séparateur est ce qui distingue `/x/cache/a` de `/x/cache-evil/a` :
  // sans lui, un frère dont le nom commence pareil passerait.
  const under = (candidate: string, roots: readonly string[]): boolean =>
    roots.some((root) => candidate === root || candidate.startsWith(root + path.sep));

  const assertWritable = (target: string): void => {
    if (!under(path.resolve(target), lexicalRoots)) refuse(target);
  };

  /**
   * Un chemin peut être valide lexicalement et sortir par un lien symbolique.
   * On résout le plus long préfixe EXISTANT — le fichier visé n'existe en
   * général pas encore — puis on re-vérifie.
   */
  const assertResolvedWritable = async (target: string): Promise<void> => {
    assertWritable(target);

    let probe = path.resolve(target);
    for (;;) {
      try {
        probe = await realpath(probe);
        break;
      } catch {
        const parent = path.dirname(probe);
        if (parent === probe) return;      // remonté jusqu'à la racine du disque
        probe = parent;
      }
    }
    // Ici, et seulement ici, la forme canonique fait autorité : c'est ce qui
    // attrape un lien symbolique DANS la racine qui pointe au-dehors.
    if (!under(probe, canonicalRoots)) refuse(target);
  };

  return {
    assertWritable,

    async writeFile(target, data) {
      await assertResolvedWritable(target);
      await writeFile(target, data);
    },

    async mkdir(target) {
      await assertResolvedWritable(target);
      await mkdir(target, { recursive: true });
    },

    async rename(from, to) {
      await assertResolvedWritable(from);
      await assertResolvedWritable(to);
      await rename(from, to);
    },

    async rm(target) {
      await assertResolvedWritable(target);
      await rm(target, { recursive: true, force: true });
    },

    createWriteStream(target) {
      // Synchrone par nature : le contrôle lexical seul. Les flux visent le
      // cache de rendus, dont les dossiers sont créés par `mkdir` ci-dessus.
      assertWritable(target);
      return nodeCreateWriteStream(target);
    },
  };
}
