/**
 * Le dump FrontPage est en `windows-1252`, pas en UTF-8 : décodé tel quel les
 * accents sont corrompus (`docs/spike-dhash-galeries.md` §4). Node ne connaît
 * pas `cp1252` nativement — seulement `latin1`, qui lui est identique sur
 * 0x00-0x7F et 0xA0-0xFF, mais DIVERGE sur 0x80-0x9F : cp1252 y place des
 * caractères imprimables (guillemets courbes, tiret cadratin, €…) là où
 * Latin-1/ISO-8859-1 a des codes de contrôle C1. Du texte copié depuis Word
 * en contient couramment.
 */
const CP1252_HIGH: Readonly<Record<number, string>> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡',
  0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž',
  0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};

export function decodeCp1252(buffer: Buffer): string {
  let out = '';
  for (const byte of buffer) {
    out += byte >= 0x80 && byte <= 0x9f
      ? (CP1252_HIGH[byte] ?? String.fromCharCode(byte))
      : String.fromCharCode(byte);
  }
  return out;
}
