import { describe, expect, test } from 'vitest';

import { extractGalleryImages } from './read_gallery_html.ts';

describe('extractGalleryImages', () => {
  test('the REAL FrontPage pattern — xthumbnail-orig-image, multi-line <br> caption, trailing &nbsp;', () => {
    // Extrait fidèle de 2003/2003_gal_11.htm, tel que lu depuis le vrai dump.
    const html = `<p align="center"><a href="2003_gal_11/Long%20Bogue-021.JPG">`
      + `<img border="5" src="2003_gal_11/Long%20Bogue-021_small.JPG" `
      + `xthumbnail-orig-image="2003_gal_11/Long Bogue-021.JPG" width="200" height="150"></a>`
      + `<br>Une des nombreuses soirées, et comme la chasse à la langouste était`
      + `<br>encore ouverte, devinez le menu ???<br>&nbsp;<p align="center">`
      + `<a href="2003_gal_11/DSCN4142.JPG"><img border="5" src="2003_gal_11/DSCN4142_small.JPG" `
      + `xthumbnail-orig-image="2003_gal_11/DSCN4142.JPG" width="200" height="150"></a>`
      + `<br>Session planche pour Seb<p align="center">`;

    const images = extractGalleryImages(html);
    expect(images).toEqual([
      {
        imagePath: '2003_gal_11/Long Bogue-021.JPG', alt: null,
        caption: 'Une des nombreuses soirées, et comme la chasse à la langouste était encore ouverte, '
          + 'devinez le menu ???',
      },
      { imagePath: '2003_gal_11/DSCN4142.JPG', alt: null, caption: 'Session planche pour Seb' },
    ]);
  });

  test('the spike’s own documented, simpler pattern — alt attribute, <p><b>caption</b></p>', () => {
    const html = `<a href="2003_gal_1/FortLaud.JPG">`
      + `<img src="2003_gal_1/FortLaud_small.JPG" alt="Funfun2 a Fort Lauderdale (Floride)"></a>`
      + `<p align="center"><b>Dernier préparatif en rush, comme d'habitude.<br>suite.</b></p>`;

    const images = extractGalleryImages(html);
    expect(images).toEqual([{
      imagePath: '2003_gal_1/FortLaud.JPG',
      alt: 'Funfun2 a Fort Lauderdale (Floride)',
      caption: 'Dernier préparatif en rush, comme d\'habitude. suite.',
    }]);
  });

  test('an image with no caption at all is null, never the empty string', () => {
    const html = `<a href="x/a.jpg"><img src="x/a_small.jpg"></a><p align="center">`
      + `<a href="x/b.jpg"><img src="x/b_small.jpg"></a><br>une légende`;
    const images = extractGalleryImages(html);
    expect(images[0]).toMatchObject({ imagePath: 'x/a.jpg', caption: null });
    expect(images[1]).toMatchObject({ imagePath: 'x/b.jpg', caption: 'une légende' });
  });

  test('a non-image link inside the page (e.g. an external reference) is ignored', () => {
    const html = `<a href="x/a.jpg"><img src="x/a_small.jpg"></a><br>Visite de Tikal, `
      + `site archéologique <a href="http://berclo.net/page01.html">Maya</a> au Guatemala.`;
    const images = extractGalleryImages(html);
    expect(images).toHaveLength(1);
    expect(images[0]?.caption).toContain('Visite de Tikal');
    expect(images[0]?.caption).toContain('Maya');
  });

  test('the last image on the page captures everything up to the end of the document', () => {
    const html = `<a href="x/a.jpg"><img src="x/a_small.jpg"></a><br>seule légende de la page`;
    expect(extractGalleryImages(html)[0]?.caption).toBe('seule légende de la page');
  });

  test('a page with no gallery images at all yields an empty array', () => {
    expect(extractGalleryImages('<html><body>rien ici</body></html>')).toEqual([]);
  });
});
