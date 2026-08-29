import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

import { from as copyFromStream } from 'pg-copy-streams';

import type { PoolClient } from '../db/pool.ts';

/**
 * Le seul chemin de chargement en masse : Postgres tourne dans un conteneur
 * Docker et ne voit pas `/Volumes/OWC Envoy Ultra`, donc `COPY … FROM
 * '<chemin>'` est exclu — il s'exécuterait côté serveur, dans le système de
 * fichiers du conteneur. Les lignes sont produites au fil de la lecture
 * SQLite, jamais matérialisées en un tableau complet avant l'envoi.
 */
export async function copyRows(
  client: PoolClient,
  table: string,
  columns: readonly string[],
  rows: AsyncIterable<readonly unknown[]> | Iterable<readonly unknown[]>,
): Promise<number> {
  let count = 0;
  const source = Readable.from((async function* generate(): AsyncGenerator<string> {
    for await (const row of rows) {
      count++;
      yield `${encodeTextRow(row)}\n`;
    }
  })());

  const sink = client.query(copyFromStream(
    `COPY ${table} (${columns.join(', ')}) FROM STDIN WITH (FORMAT text)`));
  await pipeline(source, sink);
  return count;
}

/**
 * Un littéral de tableau Postgres (`{a,b}`), pour une colonne `text[]`
 * (`evidence_entry_ids`). `copyRows` ne sait encoder que des valeurs
 * scalaires : c'est l'appelant qui pré-formate un tableau en UNE chaîne AVANT
 * de la passer, avec les règles de guillemetage du littéral de tableau —
 * distinctes de celles de la ligne `COPY` elle-même, qui s'appliquent ensuite
 * par-dessus comme sur n'importe quelle valeur texte.
 */
export function formatTextArray(values: readonly string[]): string {
  const NEEDS_QUOTING = /[,{}"\\\s]|^$/;
  const element = (value: string): string =>
    NEEDS_QUOTING.test(value)
      ? `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
      : value;
  return `{${values.map(element).join(',')}}`;
}

/**
 * Format texte de `COPY` : `\N` pour NULL, et quatre échappements
 * obligatoires. L'ORDRE n'est pas indifférent — l'antislash d'abord, sinon
 * les `\t` produits par les remplacements suivants seraient re-échappés. Un
 * `remark` de journal contient de vraies tabulations et de vrais sauts de
 * ligne, donc ce n'est pas un cas théorique.
 */
function encodeTextRow(row: readonly unknown[]): string {
  return row.map((value) => {
    if (value === null || value === undefined) return '\\N';
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      // Un objet ou un tableau non pré-formaté est une erreur d'appelant, pas
      // une valeur à deviner : `formatTextArray` existe précisément pour ça.
      throw new TypeError(`valeur non scalaire passée à copyRows : ${typeof value}`);
    }
    return String(value)
      .replaceAll('\\', '\\\\')
      .replaceAll('\t', '\\t')
      .replaceAll('\n', '\\n')
      .replaceAll('\r', '\\r');
  }).join('\t');
}
