import path from 'node:path';

/**
 * Retirés À LA SOURCE (V1.7, team-lead) — l'iframe côté client n'aura de
 * toute façon pas `allow-scripts`, mais un document d'archive ne doit pas
 * non plus PORTER de script actif. Non-gourmand, insensible à la casse :
 * les pages réelles n'ont que des paires `<script>...</script>` propres.
 */
const SCRIPT_TAG = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;

export function stripScripts(html: string): string {
  return html.replace(SCRIPT_TAG, '');
}

const TITLE_TAG = /<title[^>]*>([\s\S]*?)<\/title\s*>/i;

/** `null` seulement si la page n'a vraiment aucun `<title>` — jamais vu sur les 5 réelles, mais jamais supposé non plus. */
export function extractTitle(html: string): string | null {
  const match = TITLE_TAG.exec(html);
  return match?.[1] === undefined ? null : match[1].trim();
}

/** `http(s):`, `/` (déjà absolu), `#` (ancre), `mailto:` — jamais une cible d'actif relative sous la racine. */
function isRelativeAssetUrl(url: string): boolean {
  return url !== '' && !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(url);
}

const TAG_WITH_ASSET_ATTR = /<(img|link)\b([^>]*)>/gi;
const ASSET_ATTR = /\b(src|href)(\s*=\s*)"([^"]*)"/gi;

/**
 * Réécrit UNIQUEMENT `src="…"` (`<img>`) et `href="…"` (`<link>`, les
 * feuilles de style) vers la route d'actifs — jamais un `<a href>` : la
 * navigation entre pages est hors périmètre, seul ce qui fait RENDRE la
 * page (V1.7) l'est. `assetRouteBase` inclut déjà `?path=`.
 */
export function rewriteAssetUrls(html: string, assetRouteBase: string): string {
  return html.replace(TAG_WITH_ASSET_ATTR, (_fullTag: string, tagName: string, attrs: string) => {
    const rewrittenAttrs = attrs.replace(
      ASSET_ATTR, (fullAttr: string, attrName: string, equals: string, url: string) => {
        if (!isRelativeAssetUrl(url)) return fullAttr;
        return `${attrName}${equals}"${assetRouteBase}${encodeURIComponent(url)}"`;
      },
    );
    return `<${tagName}${rewrittenAttrs}>`;
  });
}

const CSS_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

/**
 * Une feuille de thème FrontPage référence ses propres images par `url(…)`
 * relatif à SON DOSSIER, jamais à celui de la page qui la charge — mesuré :
 * `_themes/funfun2-98/funf1011.css` contient `url(anetrule.gif)`, qui
 * désigne `_themes/funfun2-98/anetrule.gif`. `cssRelativeDir` est ce
 * dossier (relatif à la racine du site), résolu ici en POSIX pur — la
 * validation d'évasion reste celle de `resolveUnderRoot`, jamais dupliquée
 * ici : cette fonction ne fait que produire une URL, pas une garantie de
 * sécurité.
 */
export function rewriteCssUrls(css: string, cssRelativeDir: string, assetRouteBase: string): string {
  return css.replace(CSS_URL, (fullMatch: string, _quote: string, url: string) => {
    if (!isRelativeAssetUrl(url)) return fullMatch;
    const resolved = path.posix.normalize(path.posix.join(cssRelativeDir, url));
    return `url(${assetRouteBase}${encodeURIComponent(resolved)})`;
  });
}
