import { expect, test } from 'vitest';

import { extractTitle, rewriteAssetUrls, rewriteCssUrls, stripNavigationLinks, stripScripts } from './web_site_html.ts';

test('stripScripts removes every <script> block, case-insensitive, leaving the rest untouched', () => {
  const html = '<p>avant</p><script language="JavaScript"><!--\nvar x = 1;\n// --></script><p>après</p>';
  expect(stripScripts(html)).toBe('<p>avant</p><p>après</p>');
});

test('stripScripts removes several script blocks, not just the first', () => {
  const html = '<script>a();</script>text<SCRIPT type="text/javascript">b();</SCRIPT>';
  expect(stripScripts(html)).toBe('text');
});

test('extractTitle reads the <title>, trimmed', () => {
  expect(extractTitle('<html><head><title>1998-1999</title></head></html>')).toBe('1998-1999');
  expect(extractTitle('<title>  1958-1998  </title>')).toBe('1958-1998');
});

test('extractTitle is null when the page has no <title> at all — never a guess', () => {
  expect(extractTitle('<html><head></head></html>')).toBeNull();
});

test('rewriteAssetUrls rewrites img src and link href, leaves <a href> untouched — stripNavigationLinks handles those, separately', () => {
  const html = '<link rel="stylesheet" href="_themes/x/funf1011.css">'
    + '<img src="_derived/bnr.gif" width="91">'
    + '<a href="1900-1988.htm">1958-1998</a>';
  const out = rewriteAssetUrls(html, '/texts/web/asset?path=');
  expect(out).toContain('href="/texts/web/asset?path=_themes%2Fx%2Ffunf1011.css"');
  expect(out).toContain('src="/texts/web/asset?path=_derived%2Fbnr.gif"');
  expect(out).toContain('href="1900-1988.htm"');
});

test('rewriteAssetUrls leaves absolute, protocol, and anchor URLs alone', () => {
  const html = '<img src="http://example.com/x.gif">'
    + '<img src="/already/absolute.gif">'
    + '<a href="#section">jump</a>';
  const out = rewriteAssetUrls(html, '/texts/web/asset?path=');
  expect(out).toBe(html);
});

test('rewriteCssUrls resolves a theme url() relative to the CSS FILE\'S OWN directory, not the page\'s', () => {
  // Mesuré sur le corpus réel : _themes/funfun2-98/funf1011.css contient
  // url(anetrule.gif), qui désigne _themes/funfun2-98/anetrule.gif.
  const css = '.rule { background: url(anetrule.gif) repeat-x; }';
  const out = rewriteCssUrls(css, '_themes/funfun2-98', '/texts/web/asset?path=');
  expect(out).toBe('.rule { background: url(/texts/web/asset?path=_themes%2Ffunfun2-98%2Fanetrule.gif) repeat-x; }');
});

test('rewriteCssUrls handles quoted url() forms and leaves absolute URLs alone', () => {
  const css = 'a { background: url("bg.gif"); } b { background: url(\'bg2.gif\'); } c { background: url(http://x/y.gif); }';
  const out = rewriteCssUrls(css, '_themes/x', '/texts/web/asset?path=');
  expect(out).toContain('url(/texts/web/asset?path=_themes%2Fx%2Fbg.gif)');
  expect(out).toContain('url(/texts/web/asset?path=_themes%2Fx%2Fbg2.gif)');
  expect(out).toContain('url(http://x/y.gif)');
});

test('stripNavigationLinks removes href from every <a>, keeps the tag and its text intact', () => {
  const html = '<a href="1900-1988.htm">1958-1998</a> <a href="favorite.htm">Favoris</a>';
  const out = stripNavigationLinks(html);
  expect(out).toBe('<a>1958-1998</a> <a>Favoris</a>');
});

test('stripNavigationLinks never leaves an href on ANY <a>, real page shape — nav bar with inline event handlers', () => {
  // Forme réelle mesurée sur les 5 pages : href avant des attributs
  // language/onmouseover/onmouseout FrontPage.
  const html = '<a href="1998-1999.htm" language="JavaScript" '
    + 'onmouseover="if(MSFPhover) document[\'MSFPnav2\'].src=MSFPnav2h.src" '
    + 'onmouseout="if(MSFPhover) document[\'MSFPnav2\'].src=MSFPnav2n.src">'
    + '<img src="MSFPnav2n.gif"></a>';
  const out = stripNavigationLinks(html);
  expect(out).not.toContain('href');
  // Rien d'autre ne bouge — ni les gestionnaires, ni l'image, ni la structure.
  expect(out).toContain('language="JavaScript"');
  expect(out).toContain("onmouseover=\"if(MSFPhover) document['MSFPnav2'].src=MSFPnav2h.src\"");
  expect(out).toContain('<img src="MSFPnav2n.gif">');
});

test('stripNavigationLinks is case-insensitive on both the tag and the attribute', () => {
  const html = '<A HREF="1900-1988.htm">x</A>';
  expect(stripNavigationLinks(html)).toBe('<A>x</A>');
});

test('stripNavigationLinks leaves an anchor with no href alone — nothing to strip, nothing else touched', () => {
  const html = '<a name="haut">ancre</a>';
  expect(stripNavigationLinks(html)).toBe(html);
});

test('stripNavigationLinks leaves everything else untouched — img/link src/href are a different function\'s job', () => {
  const html = '<link rel="stylesheet" href="_themes/x/funf1011.css"><img src="x.gif">';
  expect(stripNavigationLinks(html)).toBe(html);
});
