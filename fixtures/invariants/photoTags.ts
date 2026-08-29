/**
 * Per-photo tags. `PhotoListItem` does not carry them (spec: the grid does
 * not need per-tile tags, only aggregate counts and the detail panel do) —
 * so this is a separate fixture, keyed by `cloudAssetId`, standing in for
 * the backend's own tag store.
 *
 * Deliberately includes ONE lying place tag — `italy` on the Tikal ruins
 * photo — the measured case from ETAT-TRAVAUX.md ("tags de lieu mentent":
 * `italy` hits 18 real Tikal photos). `mocks/handlers.ts` excludes it from
 * `PhotoFacets.tags` (the offered vocabulary) exactly the way the spec says
 * the backend must, via `PLACE_TAG_NAMES` there — a stand-in for
 * `ref.tag_kind`, and the ONLY place such a list may live: never in
 * application code, only in the mock that plays the backend's part.
 */
import type { PhotoTag } from '../../src/api/contract/photo';

export const PHOTO_TAGS: Readonly<Record<string, readonly PhotoTag[]>> = {
  // Lisboa Madere, 1999-10 — EXIF reading.
  '05b9a4fac5df4dd28dcc1002d7ec0074': [
    { name: 'famille', confidence: 74 },
    { name: 'maison', confidence: 61 },
    // A `user` keyword: no confidence, never dropped. Spec §6.3.
    { name: 'souvenir', confidence: null },
  ],
  // Saint Martin, 2002-04.
  '1a2b3c4d5e6f708192a3b4c5d6e7f801': [
    { name: 'famille', confidence: 69 },
    { name: 'plage', confidence: 58 },
    { name: 'bateau', confidence: 44 },
  ],
  // scan-0007.jpg, held in the seed task.
  'e8bc80b75e254b7db2e1454222416813': [
    { name: 'famille', confidence: 66 },
  ],
  // Capvert Guadeloupe, rank-3 proposal with a bracket.
  '2b3c4d5e6f708192a3b4c5d6e7f80911': [
    { name: 'bateau', confidence: 81 },
    { name: 'mer', confidence: 77 },
  ],
  // Capvert Guadeloupe, rank-3 proposal without a bracket.
  '3c4d5e6f708192a3b4c5d6e7f8091122': [
    { name: 'bateau', confidence: 79 },
  ],
  // December 2000 Venezuela album, §7.3's measured case.
  '864808752b754c10aca1dffbc93a10a2': [
    { name: 'bateau', confidence: 72 },
    { name: 'mer', confidence: 65 },
    // A `user` keyword: no confidence, never dropped from a vocabulary.
    { name: 'anniversaire', confidence: null },
  ],
  // Maison rose Algès.
  '4d5e6f708192a3b4c5d6e7f809112233': [
    { name: 'maison', confidence: 68 },
    { name: 'famille', confidence: 55 },
  ],
  // The rejected-EXIF scan, same album.
  '5e6f708192a3b4c5d6e7f80911223344': [
    { name: 'maison', confidence: 51 },
  ],
  // Year-only album, 2000.
  '6f708192a3b4c5d6e7f8091122334455': [
    { name: 'bateau', confidence: 48 },
  ],
  // No date, no thumbnail.
  '708192a3b4c5d6e7f809112233445566': [],
  // Tikal, 2004 — the measured lying tag.
  '8192a3b4c5d6e7f80911223344556677': [
    { name: 'ruines', confidence: 83 },
    { name: 'famille', confidence: 70 },
    // Lies: this is Guatemala, not Italy. Spec/ETAT-TRAVAUX.md's own example.
    { name: 'italy', confidence: 62 },
  ],
  // Sorel-Beaufort-Fort Lauderdale, 2003-11.
  '92a3b4c5d6e7f8091122334455667788': [
    { name: 'bateau', confidence: 75 },
  ],
};

/**
 * Text PRINTED in the image (spec §6.3's `hasOcr` axis) — never a caption.
 * `PhotoDetail.ocrText` only, same reasoning as `PHOTO_TAGS`: not carried by
 * `PhotoListItem`.
 */
export const PHOTO_OCR: Readonly<Record<string, string | null>> = {
  '2b3c4d5e6f708192a3b4c5d6e7f80911': 'FUNFUN II',
};
