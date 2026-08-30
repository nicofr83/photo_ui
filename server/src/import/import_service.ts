import path from 'node:path';
import { ulid } from 'ulid';

import { TextKind } from '@shared/enums';
import type { ImportReport } from '../contract/job_interface.ts';
import { parseCaptureDate } from '../metier/dating/capture_date.ts';
import { albumInterval, isSuspectedRange, parseAlbumPrefix, type AlbumInterval } from '../metier/dating/album_span.ts';
import { resolveCascade } from '../metier/dating/cascade.ts';
import { logbookCovers, passageCovers, type CoverWindow } from '../metier/overlap/covers.ts';
import type { Pool, PoolClient } from '../db/pool.ts';
import { withTransaction } from '../db/transaction.ts';
import { openReadOnly } from '../io/sqlite_reader.ts';
import { assertUnchanged, sourceFingerprints, type Fingerprint } from '../io/sqlite_reader.ts';
import { copyRows, formatTextArray } from '../repository/import_repository.ts';
import { recomputePageDates } from '../repository/page_date_repository.ts';
import { readOcr } from './read_content.ts';
import { readAnnotations } from './read_annotations.ts';
import { readProposals, readUnresolved } from './read_dating.ts';
import {
  readDocuments, readLogEntries, readPages, readPassages,
} from './read_documents.ts';
import {
  readAlbums, readPeople, readPhotoAlbumLinks, readPhotoPersonLinks, readPhotos, readPhotoTagLinks,
  readTags,
} from './read_index.ts';

export interface ImportSources {
  readonly mcpIndexPath: string;
  readonly mcpContentPath: string;
  readonly documentsPath: string;
  readonly datingPath: string;
  readonly annotationsDir: string;
  readonly originalsRoot: string;
  readonly perimeterSets: readonly string[];
}

const PIPELINE_TABLES = [
  'pipeline.photo', 'pipeline.album', 'pipeline.photo_album', 'pipeline.tag', 'pipeline.photo_tag',
  'pipeline.person', 'pipeline.photo_person', 'pipeline.dating_proposal', 'pipeline.dating_doubt',
  'pipeline.document', 'pipeline.page', 'pipeline.text_unit',
] as const;

/** `SRID=4326;POINT(lon lat)` — EWKT, accepté tel quel par une colonne `geography` sous `COPY`. */
function formatPoint(lat: number | null, lon: number | null): string | null {
  return lat === null || lon === null ? null : `SRID=4326;POINT(${String(lon)} ${String(lat)})`;
}

/**
 * `app.task_text.text_kind` et `app.text_correction.text_kind` sont du texte
 * libre en base (pas de `CHECK`, comme `text_unit.kind`), mais n'importent que
 * ce que l'import lui-même y a jamais écrit : `'passage'` ou `'log_entry'`.
 * Une valeur inattendue est un signe que quelque chose a écrit dans ces
 * colonnes hors du chemin prévu — refuser plutôt que mentir sur le type.
 */
function toTextKind(raw: string): TextKind {
  if (raw === TextKind.PASSAGE || raw === TextKind.LOG_ENTRY) return raw;
  throw new Error(`text_kind inconnu rencontré au constat d'orphelinat : ${raw}`);
}

/** Un tableau JSON amont (`evidence`, `candidates`) — `[]` sur tout ce qui n'est pas parseable. */
function parseJsonArray(text: string | null): unknown[] {
  if (text === null || text.trim() === '') return [];
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** `npm run db:import` : une transaction, ouverte ici — voir D5. */
export async function runImport(pool: Pool, sources: ImportSources): Promise<ImportReport> {
  return withTransaction(pool, (client) => runImportInto(client, sources));
}

export async function runImportInto(client: PoolClient, sources: ImportSources): Promise<ImportReport> {
  const importId = ulid();
  const startedAt = new Date();

  const dbFiles: Record<string, string> = {
    'mcp-index.db': sources.mcpIndexPath, 'mcp-content.db': sources.mcpContentPath,
    'documents.db': sources.documentsPath, 'dating.db': sources.datingPath,
  };
  const before: Fingerprint[] = await sourceFingerprints(
    Object.entries(dbFiles).map(([name, p]) => ({ name, path: p })));

  const indexDb = openReadOnly(sources.mcpIndexPath);
  const contentDb = openReadOnly(sources.mcpContentPath);
  const documentsDb = openReadOnly(sources.documentsPath);
  const datingDb = openReadOnly(sources.datingPath);

  try {
    await client.query(`TRUNCATE ${PIPELINE_TABLES.join(', ')} RESTART IDENTITY`);

    // ---- les petites tables de référence, chargées en mémoire une fois ----
    const { rows: refAlbumSpans } = await client.query<{ album_path: string; date_from: string; date_to: string }>(
      'SELECT album_path, date_from, date_to FROM ref.album_span');
    const refSpanByPath = new Map(refAlbumSpans.map((r) => [r.album_path, { from: r.date_from, to: r.date_to }]));

    const annotations = await readAnnotations(sources.annotationsDir);

    const proposalByPhoto = new Map([...readProposals(datingDb)].map((p) => [p.photoId, p]));
    const ocrBySha = new Map([...readOcr(contentDb)].map((o) => [o.sha256, o.text]));

    // ---- album : rang 0, indépendant du reste ----
    const rawAlbums = [...readAlbums(indexDb)];
    const albumIntervalByPath = new Map<string, AlbumInterval | null>();
    const albumRows = rawAlbums.map((a) => {
      const refSpan = refSpanByPath.get(a.path) ?? null;
      const interval = albumInterval(a.albumName, refSpan);
      albumIntervalByPath.set(a.path, interval);
      const { year: prefixYear, month: prefixMonth } = parseAlbumPrefix(a.albumName);
      const topSegment = a.path.split('/')[0] ?? '';
      return [
        a.path, a.setName, a.albumName, a.groupName, prefixYear, prefixMonth,
        sources.perimeterSets.includes(topSegment), isSuspectedRange(a.albumName),
        interval?.from ?? null, interval?.to ?? null, interval?.presumed ?? null,
      ];
    });
    await copyRows(client, 'pipeline.album',
      ['path', 'set_name', 'album_name', 'group_name', 'prefix_year', 'prefix_month', 'in_perimeter',
       'suspected_range', 'span_from', 'span_to', 'span_presumed'],
      albumRows);

    // ---- photo : la cascade est calculée EN LIGNE, dans le même passage ----
    const cascadeByRank: Record<string, number> = {};
    let datedToDay = 0, datedToMonth = 0, datedToYear = 0, undated = 0;
    let photoCount = 0;

    function* photoRows(): Generator<readonly unknown[]> {
      for (const p of readPhotos(indexDb)) {
        photoCount++;
        const { local, offsetMin, raw } = parseCaptureDate(p.captureDate);
        const album = p.albumPath === null ? null : albumIntervalByPath.get(p.albumPath) ?? null;
        const annotationDate = annotations.get(p.cloudAssetId) ?? null;
        const proposal = proposalByPhoto.get(p.cloudAssetId);
        const cascade = resolveCascade({
          captureDateLocal: local, album, annotationDate,
          proposal: proposal === undefined ? null : {
            date: proposal.date, dateSource: proposal.dateSource,
            spanHours: proposal.spanHours, evidenceEntryIds: parseJsonArray(proposal.evidence) as string[],
          },
        });

        cascadeByRank[cascade.resolvedFrom ?? 'undated'] = (cascadeByRank[cascade.resolvedFrom ?? 'undated'] ?? 0) + 1;
        if (cascade.resolvedFrom === null) undated++;
        else if (cascade.resolvedPrecision === 'day') datedToDay++;
        else if (cascade.resolvedPrecision === 'month') datedToMonth++;
        else datedToYear++;

        const relativePath = p.path.startsWith(sources.originalsRoot)
          ? p.path.slice(sources.originalsRoot.length).replace(/^\/+/, '')
          : p.path;

        yield [
          p.cloudAssetId, p.sha256, relativePath, path.basename(p.path), p.albumPath, p.groupName,
          p.format, p.fileSize, p.width, p.height, p.aestheticsScore,
          p.dateSource, p.year, p.month, p.day, local, offsetMin, raw,
          cascade.resolvedFrom, cascade.resolvedStart, cascade.resolvedEnd, cascade.resolvedPrecision,
          cascade.arbitrationGapMonths, cascade.arbitrationOutcome, cascade.bracketHours,
          formatTextArray(cascade.evidenceEntryIds),
          formatPoint(p.latitude, p.longitude), p.latitude === null || p.longitude === null ? null : 'exif',
          p.altitude, p.city, p.state, p.country, p.sublocation,
          p.cameraMake, p.cameraModel, p.lens, p.iso, p.aperture, p.shutter, p.focalLength,
          p.title, p.description, p.sha256 === null ? null : ocrBySha.get(p.sha256) ?? null,
        ];
      }
    }

    await copyRows(client, 'pipeline.photo', [
      'cloud_asset_id', 'sha256', 'relative_path', 'file_name', 'album_path', 'group_name',
      'format', 'file_size', 'width', 'height', 'aesthetics_score',
      'raw_date_source', 'raw_year', 'raw_month', 'raw_day',
      'capture_date_local', 'capture_offset_min', 'capture_date_raw',
      'resolved_from', 'resolved_start', 'resolved_end', 'resolved_precision',
      'arbitration_gap_months', 'arbitration_outcome', 'bracket_hours', 'evidence_entry_ids',
      'position', 'position_source', 'altitude_m', 'city', 'state', 'country_raw', 'sublocation',
      'camera_make', 'camera_model', 'lens', 'iso', 'aperture', 'shutter', 'focal_length',
      'title', 'description', 'ocr_text',
    ], photoRows());

    // ---- tag, personne : petites tables, avant leurs liens ----
    await copyRows(client, 'pipeline.tag', ['name', 'kind'],
      [...readTags(indexDb)].map((t) => [t.name, t.kind]));
    await copyRows(client, 'pipeline.person', ['name'],
      [...readPeople(indexDb)].map((p) => [p.name]));

    // ---- les trois tables de liens, déjà jointes sur les clés durables ----
    await copyRows(client, 'pipeline.photo_album', ['cloud_asset_id', 'album_path', 'is_primary'],
      [...readPhotoAlbumLinks(indexDb)].map((l) => [l.cloudAssetId, l.albumPath, l.isPrimary]));
    await copyRows(client, 'pipeline.photo_tag', ['cloud_asset_id', 'tag_name', 'tag_kind', 'confidence'],
      [...readPhotoTagLinks(indexDb)].map((l) => [l.cloudAssetId, l.tagName, l.tagKind, l.confidence]));
    await copyRows(client, 'pipeline.photo_person', ['cloud_asset_id', 'person_name'],
      [...readPhotoPersonLinks(indexDb)].map((l) => [l.cloudAssetId, l.personName]));

    // Un `UPDATE` corrélé par ligne (une sous-requête `count(*)` par tag) a
    // mesurément expiré sur les ~971 000 lignes réelles de `photo_tag` — 8 000
    // tags, chacun relançant son propre scan. Un `GROUP BY` unique, joint une
    // seule fois, remplace 8 000 comptages par un seul passage.
    await client.query(`
      UPDATE pipeline.album a SET photo_count = counts.n
        FROM (SELECT album_path, count(*) AS n FROM pipeline.photo_album GROUP BY album_path) counts
       WHERE counts.album_path = a.path`);
    await client.query(`
      UPDATE pipeline.tag t SET photo_count = counts.n
        FROM (SELECT tag_name, tag_kind, count(*) AS n FROM pipeline.photo_tag
               GROUP BY tag_name, tag_kind) counts
       WHERE counts.tag_name = t.name AND counts.tag_kind = t.kind`);
    await client.query(`
      UPDATE pipeline.person p SET photo_count = counts.n
        FROM (SELECT person_name, count(*) AS n FROM pipeline.photo_person GROUP BY person_name) counts
       WHERE counts.person_name = p.name`);

    // ---- rang 3 : proposition et doute, séparés ----
    await copyRows(client, 'pipeline.dating_proposal',
      ['cloud_asset_id', 'proposed_date', 'date_source', 'confidence', 'position', 'position_source',
       'evidence_entry_ids', 'span_hours'],
      [...proposalByPhoto.values()].map((p) => [
        p.photoId, p.date, p.dateSource, p.confidence, formatPoint(p.latitude, p.longitude),
        p.positionSource, formatTextArray(parseJsonArray(p.evidence) as string[]), p.spanHours,
      ]));

    const doubts = [...readUnresolved(datingDb)];
    await copyRows(client, 'pipeline.dating_doubt', ['cloud_asset_id', 'reason', 'album_path', 'candidates'],
      doubts.map((d) => [d.photoId, d.reason, d.albumPath, JSON.stringify(parseJsonArray(d.candidates))]));
    const reasons = [...new Set(doubts.map((d) => d.reason))];
    if (reasons.length > 0) {
      await client.query(
        'INSERT INTO ref.doubt_reason (reason) SELECT unnest($1::text[]) ON CONFLICT DO NOTHING', [reasons]);
    }

    // ---- documents, pages : avant les textes qui les référencent ----
    const rawDocuments = [...readDocuments(documentsDb)];
    await copyRows(client, 'pipeline.document', ['id', 'kind', 'title', 'page_count', 'has_pages'],
      rawDocuments.map((d) => [d.id, d.kind, d.title, d.pageCount, d.hasPages]));

    const rawPages = [...readPages(documentsDb)];
    const pageById = new Map(rawPages.map((p) => [p.id, p]));
    await copyRows(client, 'pipeline.page',
      ['id', 'document_id', 'ordinal', 'label', 'image_relpath', 'width', 'height',
       'window_start', 'window_end', 'span_source'],
      rawPages.map((p) => [p.id, p.documentId, p.ordinal, p.label, p.imagePath, p.width, p.height,
                            p.startAt, p.endAt, p.spanSource]));

    // ---- text_unit : passages puis entrées de journal, une seule table ----
    let passageCount = 0, logEntryCount = 0;

    function* passageRows(): Generator<readonly unknown[]> {
      for (const passage of readPassages(documentsDb)) {
        passageCount++;
        const page = passage.pageId === null ? null : pageById.get(passage.pageId) ?? null;
        const pageWindow: CoverWindow | null = page?.startAt !== null && page?.startAt !== undefined
          && page.endAt !== null
          ? { start: page.startAt, end: page.endAt } : null;
        const covers = passageCovers(passage.dateFrom, pageWindow);
        const usedPageWindow = passage.dateFrom === null && covers !== null;

        yield [
          'passage', passage.id, passage.documentId, passage.pageId, passage.ordinal, passage.text,
          passage.confidence,
          passage.dateFrom === null ? null : 'passage_date_from', passage.dateFrom, passage.dateFrom,
          covers?.start ?? null, covers?.end ?? null, covers === null ? null : 'passage',
          usedPageWindow ? page?.spanSource ?? null : null,
        ];
      }
    }

    const logEntries = [...readLogEntries(documentsDb)];
    const logCovers = logbookCovers(logEntries.map((e) => e.date));
    const worstConfidence = (a: string, b: string): string => (a === 'uncertain' || b === 'uncertain' ? 'uncertain' : 'transcribed');

    function* logEntryRows(): Generator<readonly unknown[]> {
      for (const e of logEntries) {
        logEntryCount++;
        const covers = logCovers.get(e.date) ?? null;
        yield [
          'log_entry', e.id, pageById.get(e.pageId)?.documentId ?? null, e.pageId, e.seq, e.remark ?? '',
          worstConfidence(e.fixConfidence, e.remarkConfidence),
          'log_entry_date', e.date, e.date,
          covers?.start ?? null, covers?.end ?? null, 'logbook_entry', null,
          e.time, formatPoint(e.latitude, e.longitude), e.rawPosition, e.placeName,
          e.heading, e.wind, e.baro, e.engineHours, e.fixConfidence, e.remarkConfidence,
        ];
      }
    }

    const TEXT_UNIT_COLUMNS = [
      'kind', 'id', 'document_id', 'page_id', 'ordinal', 'body', 'confidence',
      'date_source', 'date_start', 'date_end', 'covers_start', 'covers_end', 'covers_rule',
      'page_span_source',
    ] as const;

    await copyRows(client, 'pipeline.text_unit', TEXT_UNIT_COLUMNS, passageRows());
    await copyRows(client, 'pipeline.text_unit', [
      ...TEXT_UNIT_COLUMNS,
      'entry_time', 'entry_position', 'raw_position', 'place_name',
      'heading', 'wind', 'baro', 'engine_hours', 'fix_confidence', 'remark_confidence',
    ], logEntryRows());

    // ---- ce que l'import CONSTATE sans y toucher — le travail humain ----
    const { rows: orphanedImages } = await client.query<{ task_slug: string; cloud_asset_id: string }>(`
      SELECT ti.task_slug, ti.cloud_asset_id FROM app.task_image ti
       WHERE NOT EXISTS (SELECT 1 FROM pipeline.photo p WHERE p.cloud_asset_id = ti.cloud_asset_id)`);
    const { rows: orphanedTexts } = await client.query<{ task_slug: string; text_kind: string; text_id: string }>(`
      SELECT tt.task_slug, tt.text_kind, tt.text_id FROM app.task_text tt
       WHERE NOT EXISTS (SELECT 1 FROM pipeline.text_unit t
                          WHERE t.kind = tt.text_kind AND t.id = tt.text_id)`);
    const { rows: needsReview } = await client.query<{ text_kind: string; text_id: string }>(`
      SELECT c.text_kind, c.text_id FROM app.text_correction c
       WHERE NOT EXISTS (SELECT 1 FROM pipeline.text_unit t
                          WHERE t.kind = c.text_kind AND t.id = c.text_id
                            AND t.body = c.original_at_correction)`);

    // ---- empreintes après : une source a-t-elle bougé pendant la lecture ? ----
    const after = await sourceFingerprints(Object.entries(dbFiles).map(([name, p]) => ({ name, path: p })));
    assertUnchanged(before, after);

    const finishedAt = new Date();
    const report: ImportReport = {
      importId, startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(),
      photos: photoCount, albums: albumRows.length, passages: passageCount, logEntries: logEntryCount,
      annotationsRead: annotations.size,
      orphanedImageSelections: orphanedImages.map((r) => (
        { taskSlug: r.task_slug, cloudAssetId: r.cloud_asset_id })),
      orphanedTextSelections: orphanedTexts.map((r) => (
        { taskSlug: r.task_slug, textKind: toTextKind(r.text_kind), textId: r.text_id })),
      correctionsNeedingReview: needsReview.map((r) => (
        { kind: toTextKind(r.text_kind), id: r.text_id })),
      cascade: { datedToDay, datedToMonth, datedToYear, undated, byRank: cascadeByRank },
    };

    await client.query(
      `INSERT INTO pipeline.import_run (import_id, started_at, finished_at, status, sources, counts, cascade)
       VALUES ($1, $2, $3, 'succeeded', $4, $5, $6)`,
      [importId, startedAt.toISOString(), finishedAt.toISOString(), JSON.stringify(after),
       JSON.stringify({ photos: report.photos, albums: report.albums, passages: report.passages,
                        logEntries: report.logEntries, annotationsRead: report.annotationsRead }),
       JSON.stringify(report.cascade)]);

    // `app.text_search` a sa propre définition, indépendante de `pipeline` (§8.2) :
    // un `TRUNCATE`/re-remplissage de `pipeline.text_unit` la laisse périmée tant
    // que rien ne la rafraîchit. Jamais `CONCURRENTLY` ici : impossible dans une
    // transaction explicite — replié sur un `REFRESH` simple, un verrou exclusif
    // de quelques millisecondes sur 2 871 lignes, acceptable dans l'import qui
    // tient déjà toute la base verrouillée le temps de son unique transaction.
    await client.query(`REFRESH MATERIALIZED VIEW app.text_search`);

    // `app.page_date` — même raison, même repli : `pipeline.page`/`text_unit`
    // reconstruits par le `TRUNCATE` laissent la cascade v1.5 périmée tant
    // que rien ne la recalcule.
    await recomputePageDates(client);

    return report;
  } finally {
    indexDb.close();
    contentDb.close();
    documentsDb.close();
    datingDb.close();
  }
}
