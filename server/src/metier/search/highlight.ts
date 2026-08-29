import type { TextRange } from '../../contract/filter_interface.ts';

const COMBINING_DIACRITICS = /[̀-ͯ]/g;

/**
 * Pas `ts_headline` : il rend une chaîne pré-formatée, le contrat exige des
 * OFFSETS. Le calcul ne peut pas se faire en SQL — PostgreSQL compte en
 * points de code, JavaScript en unités UTF-16, et les deux divergent dès le
 * premier emoji.
 *
 * Comparaison PAR POINT DE CODE (`Array.from`, jamais un simple index de
 * chaîne — un emoji hors du PMB occupe deux unités) : chaque point de code
 * est réduit à sa forme comparable (minuscule, sans diacritique), et les
 * offsets rendus sont ceux du texte ORIGINAL, en unités UTF-16 — la
 * sémantique de `String.prototype.slice`.
 */
function normalizeCodepoint(codepoint: string): string {
  return codepoint.normalize('NFD').replace(COMBINING_DIACRITICS, '').toLowerCase();
}

export function highlight(text: string, terms: readonly string[]): readonly TextRange[] {
  if (terms.length === 0) return [];

  const codepoints = Array.from(text);
  const normalizedParts: string[] = [];
  // Offset UTF-16, dans le texte ORIGINAL, où commence chaque point de code.
  const utf16Start: number[] = [];
  let utf16Offset = 0;
  for (const codepoint of codepoints) {
    utf16Start.push(utf16Offset);
    normalizedParts.push(normalizeCodepoint(codepoint));
    utf16Offset += codepoint.length; // 1 pour le PMB, 2 pour un point de code hors PMB (emoji)
  }
  // Offset dans la chaîne NORMALISÉE où commence chaque point de code — sert
  // à retrouver, après un `indexOf` sur le texte normalisé, à quel point de
  // code original une correspondance appartient.
  const normalizedStart: number[] = [];
  let normalizedOffset = 0;
  for (const part of normalizedParts) {
    normalizedStart.push(normalizedOffset);
    normalizedOffset += part.length;
  }
  const normalizedText = normalizedParts.join('');

  const matches: { readonly normalizedIndex: number; readonly normalizedLength: number }[] = [];
  for (const term of terms) {
    const normalizedTerm = normalizeCodepoint(term);
    if (normalizedTerm === '') continue;
    let from = 0;
    for (;;) {
      const index = normalizedText.indexOf(normalizedTerm, from);
      if (index === -1) break;
      matches.push({ normalizedIndex: index, normalizedLength: normalizedTerm.length });
      from = index + normalizedTerm.length;
    }
  }
  matches.sort((a, b) => a.normalizedIndex - b.normalizedIndex);

  const codepointIndexAt = (normalizedIndex: number): number => {
    // Le premier point de code dont le début normalisé dépasse `normalizedIndex`
    // borne la recherche ; celui d'avant est le bon.
    let low = 0;
    let high = normalizedStart.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      const midStart = normalizedStart[mid] ?? 0;
      if (midStart <= normalizedIndex) low = mid;
      else high = mid - 1;
    }
    return low;
  };

  return matches.map(({ normalizedIndex, normalizedLength }): TextRange => {
    const startCodepoint = codepointIndexAt(normalizedIndex);
    const endCodepoint = codepointIndexAt(normalizedIndex + normalizedLength - 1);
    const start = utf16Start[startCodepoint] ?? 0;
    const endStart = utf16Start[endCodepoint] ?? start;
    const endCodepointRaw = codepoints[endCodepoint] ?? '';
    return { start, length: endStart + endCodepointRaw.length - start };
  });
}
