/**
 * Album fixtures. Like the photo matrix, these cover branches: an album whose
 * prefix names a month, one whose name announces a journey, one with a typed
 * span, one with a year-only prefix.
 */
import type { Album } from '../../src/api/contract/album';
import { parseIsoDate } from '../../src/shared/date_interface';

const span = (from: string, to: string, presumed: boolean, note: string | null = null) => ({
  from: parseIsoDate(from), to: parseIsoDate(to), presumed, note,
});

const NO_HINTS = { fileNamePatterns: [], rejectedExifRange: null, rejectedExifCount: 0 };

export const INVARIANT_ALBUMS: readonly Album[] = [
  {
    path: '1998-1999/1999-10 Lisboa Madere',
    setName: '1998-1999', albumName: '1999-10 Lisboa Madere', groupName: 'Lisboa Madere',
    photoCount: 1, prefixYear: 1999, prefixMonth: 10,
    span: span('1999-10-01', '1999-10-31', true),
    suspectedRange: true, hints: NO_HINTS,
  },
  {
    // The measured case: a typed span covering seventeen months.
    path: '1998-1999/1998-02-Maison rose Algès',
    setName: '1998-1999', albumName: '1998-02-Maison rose Algès', groupName: 'Maison rose Algès',
    photoCount: 2, prefixYear: 1998, prefixMonth: 2,
    span: span('1998-02-01', '1999-06-30', false, 'Février 1998 à fin juin 1999 — Nicolas'),
    suspectedRange: true,
    hints: {
      fileNamePatterns: ['98-99'],
      rejectedExifRange: { from: parseIsoDate('2013-12-01'), to: parseIsoDate('2014-01-31') },
      rejectedExifCount: 19,
    },
  },
  {
    path: '2000-2001/2000-12-viree au Venezuela-3mois',
    setName: '2000-2001', albumName: '2000-12-viree au Venezuela-3mois',
    groupName: 'viree au Venezuela',
    photoCount: 1, prefixYear: 2000, prefixMonth: 12,
    span: span('2000-12-01', '2000-12-31', true),
    suspectedRange: true, hints: NO_HINTS,
  },
  {
    path: '2000-2001/2000',
    setName: '2000-2001', albumName: '2000', groupName: null,
    photoCount: 1, prefixYear: 2000, prefixMonth: null,
    span: span('2000-01-01', '2000-12-31', true),
    suspectedRange: false, hints: NO_HINTS,
  },
  {
    path: '2004/2004-03- visite de Tikal',
    setName: '2004', albumName: '2004-03- visite de Tikal', groupName: 'visite de Tikal',
    photoCount: 1, prefixYear: 2004, prefixMonth: 3,
    span: span('2004-03-01', '2004-03-31', true),
    suspectedRange: false, hints: NO_HINTS,
  },
] as const;
