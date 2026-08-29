/**
 * Extraction des galeries FrontPage (`docs/spike-dhash-galeries.md` §4) : par
 * MOTIF, pas par un analyseur HTML complet — ce dump a 25 ans, ses balises
 * sont mal fermées et FrontPage y insère ses propres attributs. Un motif
 * ciblé sur ce qui compte (l'ancre-image, sa légende) est plus robuste qu'un
 * analyseur générique qui buterait sur le reste de la page.
 */
export interface GalleryImage {
  /** Chemin RELATIF à la page, ex. `2003_gal_11/Long Bogue-021.JPG` — jamais percent-encodé. */
  readonly imagePath: string;
  readonly alt: string | null;
  /** `null` si aucun texte ne suit l'ancre — jamais la chaîne vide. */
  readonly caption: string | null;
}

// `<a href="…"><img …></a>` — la cible du lien est l'image PLEINE TAILLE (§4).
const ANCHOR_IMG = /<a\s+href="([^"]+)"[^>]*>\s*<img\b([^>]*)>\s*<\/a>/gis;
const IMAGE_EXTENSION = /\.(?:jpe?g|png|gif)$/i;

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag);
  return match?.[1] ?? null;
}

/**
 * Le texte qui suit l'ancre jusqu'à la prochaine ancre-image (ou la fin du
 * document) : `<br>` devient un saut de ligne, tout le reste des balises est
 * effacé, `&nbsp;` et les entités les plus courantes sont résolues. `null`
 * si rien ne reste — un `<p align="center">` ou un `&nbsp;` isolé ne sont
 * pas une légende.
 */
function extractCaption(betweenAnchors: string): string | null {
  const text = betweenAnchors
    .replaceAll(/<br\s*\/?>/gi, '\n')
    .replaceAll(/<[^>]+>/g, ' ')
    .replaceAll(/&nbsp;/gi, ' ')
    .replaceAll(/&amp;/gi, '&')
    .replaceAll(/&quot;/gi, '"')
    .replaceAll(/&#39;|&rsquo;/gi, '’')
    .split('\n')
    .map((line) => line.replaceAll(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
    .join(' ')
    .trim();
  return text === '' ? null : text;
}

export function extractGalleryImages(html: string): GalleryImage[] {
  const anchors = [...html.matchAll(ANCHOR_IMG)];
  const images: GalleryImage[] = [];

  for (const [index, match] of anchors.entries()) {
    const href = match[1];
    const imgTag = match[2];
    if (href === undefined || imgTag === undefined || !IMAGE_EXTENSION.test(href)) continue;

    // `xthumbnail-orig-image` est déjà décodé (espaces réels) ; `href` est
    // percent-encodé pour l'URL et doit l'être défait.
    const imagePath = attr(imgTag, 'xthumbnail-orig-image') ?? decodeURIComponent(href);

    const start = match.index + match[0].length;
    const end = anchors[index + 1]?.index ?? html.length;

    images.push({ imagePath, alt: attr(imgTag, 'alt'), caption: extractCaption(html.slice(start, end)) });
  }

  return images;
}
