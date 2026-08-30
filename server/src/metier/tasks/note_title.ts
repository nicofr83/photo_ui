/**
 * Le titre d'une note tirée d'un texte d'époque porte son attribution —
 * « journal de bord, page 12 du 04/11/2003 ». C'est le SEUL porteur de
 * provenance pour qui lit `textes/notes.md`, où le rattachement n'apparaît
 * pas. Le verrou est donc au serveur : `PATCH` accepte n'importe quel titre,
 * et une protection d'interface ne protégerait rien.
 *
 * Convention : le préfixe est ce qui précède le premier tiret cadratin.
 * L'utilisateur écrit ce qu'il veut après, jamais avant.
 */
const SOURCE_LABELS = ['journal de bord, ', 'ma vie, ', 'site web, '] as const;

export function attributionPrefix(title: string): string | null {
  const known = SOURCE_LABELS.some((label) => title.startsWith(label));
  if (!known) return null;
  const cut = title.indexOf(' — ');
  return (cut === -1 ? title : title.slice(0, cut)).trimEnd();
}

export function titleKeepsPrefix(current: string, next: string): boolean {
  const prefix = attributionPrefix(current);
  if (prefix === null) return true;
  return next === prefix || next.startsWith(`${prefix} — `);
}
