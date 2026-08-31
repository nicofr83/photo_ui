/**
 * Réduit toute suite d'espaces, tabulations et retours à la ligne à une
 * espace simple, extrémités rognées (contrat, amendement V1.7). Sans elle,
 * l'écran « Ma vie » marquerait comme retouchée toute note prise verbatim :
 * il affiche une phrase par ligne, donc une sélection fidèle y arrive avec
 * des retours à la ligne que la page ne contient pas.
 */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * « La personne a-t-elle touché au texte après l'avoir copié ? » — le corps
 * de la note comparé à l'INSTANTANÉ pris à la copie, jamais à la source
 * actuelle (c'est `isQuotable`, une question différente). `false` sans
 * instantané : une note écrite de zéro n'est jamais « éditée depuis ».
 */
export function isEditedSince(body: string, derivedTextOriginal: string | null): boolean {
  if (derivedTextOriginal === null) return false;
  return normalizeWhitespace(body) !== normalizeWhitespace(derivedTextOriginal);
}

/**
 * « Le générateur peut-il citer ceci comme voix d'époque ? » — le corps de
 * la note, espaces normalisés, est-il un extrait CONTIGU du texte effectif
 * ACTUEL de sa source (jamais l'instantané — c'est le point qui fait
 * qu'une source corrigée après coup retire d'elle-même la citabilité,
 * sans règle dédiée). Une coupe reste citable ; une réécriture, même d'un
 * mot, en sort — c'est exactement ce qu'un test de sous-chaîne CONTIGUË
 * donne pour rien.
 */
export function isQuotable(body: string, currentSourceText: string | null): boolean {
  if (currentSourceText === null) return false;
  const normalizedBody = normalizeWhitespace(body);
  if (normalizedBody === '') return false;
  return normalizeWhitespace(currentSourceText).includes(normalizedBody);
}

export interface PassageRef {
  readonly kind: string;
  readonly id: string;
}

export interface PassageWithText extends PassageRef {
  readonly text: string;
}

export interface LocatedPassages {
  readonly matched: boolean;
  readonly refs: readonly PassageRef[];
}

/**
 * Sur une page composée de plusieurs passages, quels passages une
 * sélection libre recouvre — « et eux seuls », jamais toute la page
 * (export, V1.7) : une sélection de deux phrases ne doit pas faire entrer
 * trente passages dans le dossier. Concatène les passages dans le MÊME
 * ordre et avec le MÊME séparateur (un espace) que `derivedSourceTextSql`
 * côté SQL — les deux DOIVENT rester d'accord sur ce qu'est « le texte de
 * la page », jamais deux versions qui pourraient diverger.
 *
 * `matched: false` : la sélection ne correspond plus à rien (réécrite, ou
 * la source a changé depuis) — rien à localiser, l'appelant décide quoi
 * faire (l'export émet alors la note sans source ancrée pour cette page).
 */
export function locatePassagesForSelection(
  body: string, passages: readonly PassageWithText[],
): LocatedPassages {
  const normalizedBody = normalizeWhitespace(body);
  if (normalizedBody === '') return { matched: false, refs: [] };

  const spans: { readonly ref: PassageRef; readonly start: number; readonly end: number }[] = [];
  const parts: string[] = [];
  let cursor = 0;
  for (const passage of passages) {
    const normalized = normalizeWhitespace(passage.text);
    if (normalized === '') continue;
    if (parts.length > 0) cursor += 1; // le séparateur d'un espace, déjà compté dans le curseur
    const start = cursor;
    parts.push(normalized);
    cursor += normalized.length;
    spans.push({ ref: { kind: passage.kind, id: passage.id }, start, end: cursor });
  }

  const fullText = parts.join(' ');
  const matchStart = fullText.indexOf(normalizedBody);
  if (matchStart === -1) return { matched: false, refs: [] };
  const matchEnd = matchStart + normalizedBody.length;

  const refs = spans.filter((span) => span.start < matchEnd && span.end > matchStart).map((span) => span.ref);
  return { matched: true, refs };
}
