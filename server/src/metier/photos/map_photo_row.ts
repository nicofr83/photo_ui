import { DateKind, DatePrecision, DateSource, PositionSource } from '@shared/enums';
import type { FieldMatch } from '../../contract/filter_interface.ts';
import type { PhotoListItem } from '../../contract/photo_interface.ts';

/**
 * La ligne SQL brute, telle que `photo_repository.ts` la produit — colonnes de
 * `pipeline.photo` plus les calculs de la requête (`country`, `lat`/`lon`,
 * `has_caption`, `people`, `in_task_slugs`, `matched_on`).
 */
export interface PhotoRow {
  readonly cloud_asset_id: string;
  readonly sha256: string;
  readonly album_path: string | null;
  readonly group_name: string | null;
  readonly file_name: string;
  readonly format: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly aesthetics_score: number | null;
  readonly raw_date_source: string;
  readonly capture_date_local: string | null;
  readonly capture_offset_min: number | null;
  readonly capture_date_raw: string | null;
  readonly resolved_from: string | null;
  readonly resolved_start: string | null;
  readonly resolved_end: string | null;
  readonly resolved_precision: string | null;
  readonly resolved_kind: string | null;
  readonly arbitration_gap_months: number | null;
  readonly arbitration_outcome: 'accepted' | 'rejected' | null;
  readonly bracket_hours: number | null;
  readonly lat: number | null;
  readonly lon: number | null;
  readonly position_source: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly country: string | null;
  readonly country_raw: string | null;
  readonly sublocation: string | null;
  readonly people: readonly string[];
  readonly in_task_slugs: readonly string[];
  readonly has_caption: boolean;
  readonly matched_on: readonly FieldMatch[];
}

const POSITION_KIND: Record<string, DateKind> = {
  [PositionSource.EXIF]: DateKind.READING,
  [PositionSource.LOGBOOK_INTERPOLATED]: DateKind.INFERENCE,
};

/**
 * `pipeline.photo.capture_date_local` est une vraie colonne `timestamp`
 * Postgres — `db/pool.ts` ne la convertit jamais en `Date` (76 % des
 * `captureDate` amont n'ont aucun fuseau), mais le driver la rend telle
 * quelle, séparateur ESPACE (`2013-12-15 11:55:10`). `LocalDateTime` (contrat
 * §2.5) exige un `T` : une conversion de format pur, jamais une conversion de
 * fuseau — celle-là reste interdite (« on ne convertit jamais »).
 */
function toLocalDateTime(value: string): string {
  return value.replace(' ', 'T');
}

export function mapPhotoRow(row: PhotoRow): PhotoListItem {
  const date = row.resolved_from === null || row.resolved_start === null || row.resolved_end === null
    || row.resolved_precision === null || row.resolved_kind === null
    ? null
    : {
        start: row.resolved_start, end: row.resolved_end,
        precision: row.resolved_precision as DatePrecision, kind: row.resolved_kind as DateKind,
        source: row.resolved_from as DateSource, bracketHours: row.bracket_hours,
      };
  const captureDateLocal = row.capture_date_local === null ? null : toLocalDateTime(row.capture_date_local);

  const arbitration = row.arbitration_outcome === null || captureDateLocal === null
    ? null
    : { exifDate: captureDateLocal, gapMonths: row.arbitration_gap_months ?? 0, outcome: row.arbitration_outcome };

  const position = row.lat === null || row.lon === null
    ? null
    : {
        lat: row.lat, lon: row.lon,
        kind: (row.position_source !== null ? POSITION_KIND[row.position_source] : undefined) ?? DateKind.READING,
        source: (row.position_source ?? PositionSource.EXIF) as (typeof PositionSource)[keyof typeof PositionSource],
      };

  return {
    cloudAssetId: row.cloud_asset_id,
    sha256: row.sha256,
    date, arbitration,
    rawDateSource: row.raw_date_source,
    captureDateLocal,
    captureOffsetMin: row.capture_offset_min,
    captureDateRaw: row.capture_date_raw,
    position,
    place: {
      city: row.city, state: row.state, country: row.country,
      countryRaw: row.country_raw, sublocation: row.sublocation,
    },
    albumPath: row.album_path,
    groupName: row.group_name,
    fileName: row.file_name,
    format: row.format,
    width: row.width, height: row.height,
    aestheticsScore: row.aesthetics_score,
    people: row.people,
    inTaskSlugs: row.in_task_slugs,
    matchedOn: row.matched_on,
    hasCaption: row.has_caption,
    // La passe de légendage n'a jamais tourné (D9) : pas d'extrait à produire.
    captionExcerpt: null,
    thumbUrl: `/images/${row.sha256}/thumb`,
    renderUrl: `/images/${row.sha256}/render?edge=1400`,
  };
}
