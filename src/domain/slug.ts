/**
 * Derives the delivered folder's name from a task title.
 *
 * The slug IS the directory name, so it must be safe on a file system and
 * stable: it is editable at creation only (spec §5.1), because renaming it
 * later would orphan a folder already on disk.
 */
export function slugify(title: string): string {
  return title
    .normalize('NFD')
    // Strip combining marks: fold accents rather than dropping the letters.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
