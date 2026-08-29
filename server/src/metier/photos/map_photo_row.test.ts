import { describe, expect, test } from 'vitest';

import { mapPhotoRow, type PhotoRow } from './map_photo_row.ts';

const BASE_ROW: PhotoRow = {
  cloud_asset_id: 'a'.repeat(32), sha256: 'b'.repeat(64),
  album_path: 'set/2000-12', group_name: null, file_name: 'photo.jpg', format: 'jpg',
  width: 800, height: 600, aesthetics_score: 50,
  raw_date_source: 'folder-month', capture_date_local: null, capture_offset_min: null, capture_date_raw: null,
  resolved_from: null, resolved_start: null, resolved_end: null, resolved_precision: null, resolved_kind: null,
  arbitration_gap_months: null, arbitration_outcome: null, bracket_hours: null,
  lat: null, lon: null, position_source: null,
  city: null, state: null, country: null, country_raw: null, sublocation: null,
  people: [], in_task_slugs: [], has_caption: false, matched_on: [],
};

describe('mapPhotoRow', () => {
  test('a fully undated, unpositioned row maps to null date/arbitration/position', () => {
    const item = mapPhotoRow(BASE_ROW);
    expect(item.date).toBeNull();
    expect(item.arbitration).toBeNull();
    expect(item.position).toBeNull();
  });

  test('a resolved date maps every field, bracketHours passed through as-is', () => {
    const item = mapPhotoRow({
      ...BASE_ROW, resolved_from: 'album_month', resolved_start: '2000-12-01', resolved_end: '2000-12-31',
      resolved_precision: 'month', resolved_kind: 'inference', bracket_hours: null,
    });
    expect(item.date).toEqual({
      start: '2000-12-01', end: '2000-12-31', precision: 'month', kind: 'inference',
      source: 'album_month', bracketHours: null,
    });
  });

  test('an accepted arbitration maps exifDate from capture_date_local, space turned into T', () => {
    // `capture_date_local` est une vraie colonne `timestamp` Postgres (db/pool.ts
    // ne la convertit JAMAIS en `Date`, mais le driver la rend telle quelle,
    // séparateur espace) — jamais le `T` qu'écrirait un import déjà formaté.
    const item = mapPhotoRow({
      ...BASE_ROW, capture_date_local: '2000-12-14 10:22:03', arbitration_outcome: 'accepted', arbitration_gap_months: 0,
    });
    expect(item.arbitration).toEqual({ exifDate: '2000-12-14T10:22:03', gapMonths: 0, outcome: 'accepted' });
  });

  test('captureDateLocal itself gets the same space-to-T conversion', () => {
    const item = mapPhotoRow({ ...BASE_ROW, capture_date_local: '2000-12-14 10:22:03' });
    expect(item.captureDateLocal).toBe('2000-12-14T10:22:03');
  });

  test('a rejected arbitration with a null gap defaults to 0, never undefined', () => {
    const item = mapPhotoRow({
      ...BASE_ROW, capture_date_local: '2017-04-11 09:15:00', arbitration_outcome: 'rejected', arbitration_gap_months: null,
    });
    expect(item.arbitration?.gapMonths).toBe(0);
  });

  test('a position with source "exif" maps to kind reading', () => {
    const item = mapPhotoRow({ ...BASE_ROW, lat: 38.5, lon: -9.2, position_source: 'exif' });
    expect(item.position).toEqual({ lat: 38.5, lon: -9.2, kind: 'reading', source: 'exif' });
  });

  test('a position with source "logbook_interpolated" maps to kind inference', () => {
    const item = mapPhotoRow({ ...BASE_ROW, lat: 38.5, lon: -9.2, position_source: 'logbook_interpolated' });
    expect(item.position).toEqual({ lat: 38.5, lon: -9.2, kind: 'inference', source: 'logbook_interpolated' });
  });

  test('a position with lat/lon but no source falls back to exif/reading, never crashes', () => {
    const item = mapPhotoRow({ ...BASE_ROW, lat: 1, lon: 2, position_source: null });
    expect(item.position).toEqual({ lat: 1, lon: 2, kind: 'reading', source: 'exif' });
  });

  test('the place block carries every field independently, including all-null', () => {
    const item = mapPhotoRow({
      ...BASE_ROW, city: 'Lisbonne', state: null, country: 'Portugal', country_raw: 'Portugal', sublocation: null,
    });
    expect(item.place).toEqual({
      city: 'Lisbonne', state: null, country: 'Portugal', countryRaw: 'Portugal', sublocation: null,
    });
  });

  test('thumbUrl and renderUrl are built from sha256, captionExcerpt is always null (no captioning pass yet)', () => {
    const item = mapPhotoRow(BASE_ROW);
    expect(item.thumbUrl).toBe(`/images/${'b'.repeat(64)}/thumb`);
    expect(item.renderUrl).toBe(`/images/${'b'.repeat(64)}/render?edge=1400`);
    expect(item.captionExcerpt).toBeNull();
  });

  test('people, inTaskSlugs and matchedOn pass through as given', () => {
    const item = mapPhotoRow({
      ...BASE_ROW, people: ['Nicolas'], in_task_slugs: ['transat'],
      matched_on: [{ field: 'album_path', value: 'set/2000-12' }],
    });
    expect(item.people).toEqual(['Nicolas']);
    expect(item.inTaskSlugs).toEqual(['transat']);
    expect(item.matchedOn).toEqual([{ field: 'album_path', value: 'set/2000-12' }]);
  });
});
