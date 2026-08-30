import { parseIsoDate } from '../shared/date_interface';

import type { Album } from '../api/contract/album';

import { sortAlbumsByPath } from './albumOrder';

function album(path: string, suspectedRange = false): Album {
  return {
    path,
    setName: path.includes('/') ? (path.split('/')[0] as string) : null,
    albumName: path.split('/').at(-1) ?? path,
    groupName: null,
    photoCount: 1,
    prefixYear: null,
    prefixMonth: null,
    span: { from: parseIsoDate('2000-01-01'), to: parseIsoDate('2000-01-31'), presumed: true, note: null },
    suspectedRange,
    hints: { fileNamePatterns: [], rejectedExifRange: null, rejectedExifCount: 0 },
  };
}

describe('sortAlbumsByPath — spec §5.4/§5.7, every screen that lists albums', () => {
  test('alphabetical on the path — the AAAA-MM prefix gives chronological order for free', () => {
    const albums = [
      album('2004/2004-10-Monaco-Val d’Isere'),
      album('1998-1999/1998-02-Maison rose Algès'),
      album('2000-2001/2000-11-BVI'),
    ];
    expect(sortAlbumsByPath(albums).map((a) => a.path)).toEqual([
      '1998-1999/1998-02-Maison rose Algès',
      '2000-2001/2000-11-BVI',
      '2004/2004-10-Monaco-Val d’Isere',
    ]);
  });

  test('never reorders by suspectedRange or any date field — a plain string sort on path alone', () => {
    const albums = [
      album('2004/2004-01-Un'),
      album('1998-1999/1998-01-Deux', true),
    ];
    expect(sortAlbumsByPath(albums).map((a) => a.path)).toEqual([
      '1998-1999/1998-01-Deux',
      '2004/2004-01-Un',
    ]);
  });

  test('v1.5: two albums from the same month do not swap on their capitalisation', () => {
    const sorted = sortAlbumsByPath([
      album('2003/2003-03-everglades'), album('2003/2003-03-Fort Lauderdale'),
    ]);
    // Default localeCompare ignores case and would put "everglades" first;
    // the sort must be stable and predictable, uppercase before lowercase.
    expect(sorted.map((a) => a.path)).toEqual([
      '2003/2003-03-Fort Lauderdale', '2003/2003-03-everglades',
    ]);
  });

  test('v1.5: the leading set gives chronological order for free', () => {
    const sorted = sortAlbumsByPath([
      album('2004/2004-02-Belize'), album('1998-1999/1998-03-Lisbonne'),
      album('2000-2001/2000-01-guadeloupe'),
    ]);
    expect(sorted.map((a) => a.setName)).toEqual(['1998-1999', '2000-2001', '2004']);
  });
});
