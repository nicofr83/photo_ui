/**
 * V1.7, spec "« Ma vie »": une phrase par ligne — precise rules so the
 * split is predictable. A DISPLAY heuristic only: it never touches the
 * stored text, and a text with no terminal punctuation stays one block —
 * never split on length or a comma (spec's own words, twice).
 *
 * Cut AFTER `.`, `!`, `?` or `…` (optionally followed by closing
 * punctuation — `»`, `"`, `'`, `)`, `]`) when a space then a capital, a
 * digit, a dialogue dash or an opening guillemet follows. NEVER cut when
 * the period belongs to: a known abbreviation, an initial (one capital
 * letter), a decimal number or a time, or an ellipsis continued in
 * lowercase (already excluded by the capital-only rule above — no
 * separate check needed for it).
 */
const TERMINALS = new Set(['.', '!', '?', '…']);
const CLOSERS = new Set(['»', '"', '\'', ')', ']']);
const ABBREVIATIONS = new Set([
  'M', 'Mme', 'Mlle', 'Dr', 'St', 'Ste', 'cf', 'etc', 'ex', 'env', 'art', 'n°', 'p', 'av', 'bd', 'Cap',
]);
// A capital or an accented capital, a digit, a dialogue dash, or an opening guillemet.
const STARTS_NEW_SENTENCE = /^[A-ZÀ-Ý0-9—–«]/;
const INITIAL_BEFORE = /(?:^|[\s(«"'—–-])([A-ZÀ-Ý])$/;
const WORD_BEFORE = /([A-Za-zÀ-ÿ°]+)$/;

export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    if (!TERMINALS.has(text[i] ?? '')) continue;

    let after = i + 1;
    while (after < text.length && CLOSERS.has(text[after] ?? '')) after += 1;

    // Must be followed by whitespace, then something that starts a new sentence.
    if (text[after] !== ' ') continue;
    let next = after + 1;
    while (text[next] === ' ') next += 1;
    const nextChar = text[next];
    if (nextChar === undefined || !STARTS_NEW_SENTENCE.test(nextChar)) continue;

    if (text[i] === '.') {
      // A decimal number or a coordinate: a digit on both sides of the dot.
      const before = text[i - 1] ?? '';
      const digitAfter = text[i + 1] ?? '';
      if (/[0-9]/.test(before) && /[0-9]/.test(digitAfter)) continue;

      // An initial: a single capital letter at a word boundary.
      if (INITIAL_BEFORE.test(text.slice(0, i))) continue;

      // A known abbreviation immediately before the dot.
      const word = WORD_BEFORE.exec(text.slice(0, i))?.[1];
      if (word !== undefined && ABBREVIATIONS.has(word)) continue;
    }

    sentences.push(text.slice(start, after).trim());
    start = next;
  }

  const rest = text.slice(start).trim();
  if (rest !== '') sentences.push(rest);
  return sentences.length === 0 ? [text] : sentences;
}
