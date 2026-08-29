import type { PoolClient } from '../../db/pool.ts';
import { readAnnotations } from '../../import/read_annotations.ts';
import { albumInterval, parseAlbumPrefix, type AlbumInterval } from './album_span.ts';
import { resolveCascade } from './cascade.ts';

export type AlbumSpanWarning =
  | { readonly code: 'outside_prefix_year'; readonly prefixYear: number }
  | { readonly code: 'overlaps_album'; readonly albumPath: string };

export interface RecomputeStats {
  readonly photosAffected: number;
  readonly datesChanged: number;
  readonly precisionChanged: number;
}

interface PhotoRow {
  cloud_asset_id: string;
  capture_date_local: string | null;
  resolved_from: string | null;
  resolved_start: string | null;
  resolved_end: string | null;
  resolved_precision: string | null;
}

interface ProposalRow {
  cloud_asset_id: string;
  proposed_date: string;
  date_source: string;
  span_hours: number | null;
  evidence_entry_ids: readonly string[];
}

/**
 * « Le seul recalcul partiel autorisé de la cascade » (contrat §4.8) — un
 * album à la fois, synchrone, dans la transaction de la requête. Ne réutilise
 * PAS `pipeline.dating_proposal`/`readAnnotations` en dehors d'ici : c'est
 * EXACTEMENT ce que l'import fait pour toutes les photos, réduit à un album.
 */
export async function recomputeAlbum(
  client: PoolClient, annotationsDir: string, albumPath: string, newInterval: AlbumInterval | null,
): Promise<RecomputeStats> {
  const { rows: photoRows } = await client.query<PhotoRow>(`
    SELECT p.cloud_asset_id, p.capture_date_local, p.resolved_from, p.resolved_start, p.resolved_end,
           p.resolved_precision
      FROM pipeline.photo p
      JOIN pipeline.photo_album pa ON pa.cloud_asset_id = p.cloud_asset_id
     WHERE pa.album_path = $1`, [albumPath]);

  if (photoRows.length === 0) return { photosAffected: 0, datesChanged: 0, precisionChanged: 0 };

  const ids = photoRows.map((r) => r.cloud_asset_id);
  const annotations = await readAnnotations(annotationsDir);
  const { rows: proposalRows } = await client.query<ProposalRow>(
    `SELECT cloud_asset_id, proposed_date, date_source, span_hours, evidence_entry_ids
       FROM pipeline.dating_proposal WHERE cloud_asset_id = ANY($1)`, [ids]);
  const proposalByPhoto = new Map(proposalRows.map((r) => [r.cloud_asset_id, r]));

  let datesChanged = 0;
  let precisionChanged = 0;

  for (const row of photoRows) {
    const proposal = proposalByPhoto.get(row.cloud_asset_id);
    const cascade = resolveCascade({
      captureDateLocal: row.capture_date_local,
      album: newInterval,
      annotationDate: annotations.get(row.cloud_asset_id) ?? null,
      proposal: proposal === undefined ? null : {
        date: proposal.proposed_date, dateSource: proposal.date_source,
        spanHours: proposal.span_hours, evidenceEntryIds: proposal.evidence_entry_ids,
      },
    });

    const dateChanged = cascade.resolvedStart !== row.resolved_start || cascade.resolvedEnd !== row.resolved_end
      || cascade.resolvedFrom !== row.resolved_from;
    if (dateChanged) datesChanged++;
    if (cascade.resolvedPrecision !== row.resolved_precision) precisionChanged++;

    await client.query(`
      UPDATE pipeline.photo
         SET resolved_from = $2, resolved_start = $3, resolved_end = $4, resolved_precision = $5,
             arbitration_gap_months = $6, arbitration_outcome = $7, bracket_hours = $8, evidence_entry_ids = $9
       WHERE cloud_asset_id = $1`,
      [
        row.cloud_asset_id, cascade.resolvedFrom, cascade.resolvedStart, cascade.resolvedEnd,
        cascade.resolvedPrecision, cascade.arbitrationGapMonths, cascade.arbitrationOutcome, cascade.bracketHours,
        cascade.evidenceEntryIds,
      ],
    );
  }

  return { photosAffected: photoRows.length, datesChanged, precisionChanged };
}

/**
 * `outside_prefix_year` : accepté malgré tout — c'est précisément le cas que
 * la saisie existe pour traiter (§4.8, `Maison rose Algès` s'étend jusqu'en
 * juin 1999). `overlaps_album` : un avertissement par album qui chevauche,
 * jamais un refus.
 */
export async function computeAlbumSpanWarnings(
  client: PoolClient, albumPath: string, albumName: string, interval: AlbumInterval,
): Promise<readonly AlbumSpanWarning[]> {
  const warnings: AlbumSpanWarning[] = [];

  // Pas « ne chevauche pas » — CONTIENT : `1998-02-Maison rose Algès` chevauche
  // bien 1998 (elle commence en février 1998) mais s'étend jusqu'en juin 1999,
  // et c'est PRÉCISÉMENT le cas que la saisie existe pour traiter (§4.8) —
  // donc « ne recouvre pas » veut dire « déborde », pas « aucun chevauchement ».
  const { year: prefixYear } = parseAlbumPrefix(albumName);
  if (prefixYear !== null) {
    const yearStart = `${String(prefixYear)}-01-01`;
    const yearEnd = `${String(prefixYear)}-12-31`;
    const { rows } = await client.query<{ contained: boolean }>(
      `SELECT daterange($3::date, $4::date, '[]') @> daterange($1::date, $2::date, '[]') AS contained`,
      [interval.from, interval.to, yearStart, yearEnd]);
    if (rows[0]?.contained !== true) warnings.push({ code: 'outside_prefix_year', prefixYear });
  }

  const { rows: overlapping } = await client.query<{ path: string }>(`
    SELECT path FROM pipeline.album
     WHERE path != $1 AND in_perimeter
       AND daterange(span_from, span_to, '[]') && daterange($2::date, $3::date, '[]')
     ORDER BY path`, [albumPath, interval.from, interval.to]);
  for (const row of overlapping) warnings.push({ code: 'overlaps_album', albumPath: row.path });

  return warnings;
}

export { albumInterval };
