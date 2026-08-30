/**
 * Case- and accent-insensitive SUBSTRING match, client-side (spec §5.7: 82
 * albums fit in memory, no server round trip for this list). NFD before
 * stripping combining marks on BOTH sides — the contract documents
 * `Album.path` as NFC (`domain/filterState.ts`'s own comment, "every string
 * crossing the API is NFC"), but the real served value has been seen
 * decomposed in practice, and a person can type either form too. Folding
 * everything through NFD first makes the match correct regardless of which
 * form actually arrives on either side.
 */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function matchesSearch(haystack: string, query: string): boolean {
  const needle = fold(query.trim());
  return needle === '' || fold(haystack).includes(needle);
}
