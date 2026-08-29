import path from 'node:path';

import { createLog } from '../log/log.ts';
import { loadConfig } from '../runtime/config.ts';
import { createPool } from '../db/pool.ts';
import { runImport, type ImportSources } from './import_service.ts';

/**
 * `npm run db:import`. Une seule transaction (D5) : soit tout, soit rien —
 * un import qui échoue à mi-parcours laisse `pipeline` exactement dans son
 * état précédent.
 */
const config = loadConfig(process.env);
const log = createLog(config.logLevel);
const pool = createPool(config.databaseUrl);

const sources: ImportSources = {
  mcpIndexPath: path.join(config.pipelineDbRoot, 'mcp-index.db'),
  mcpContentPath: path.join(config.pipelineDbRoot, 'mcp-content.db'),
  documentsPath: path.join(config.pipelineDbRoot, 'documents.db'),
  datingPath: path.join(config.pipelineDbRoot, 'dating.db'),
  annotationsDir: config.annotationsDir,
  originalsRoot: config.originalsRoot,
  perimeterSets: config.perimeterSets,
};

try {
  const report = await runImport(pool, sources);
  log.info('import terminé', {
    importId: report.importId, photos: report.photos, albums: report.albums,
    passages: report.passages, logEntries: report.logEntries, annotationsRead: report.annotationsRead,
    cascade: report.cascade,
    orphanedImageSelections: report.orphanedImageSelections.length,
    orphanedTextSelections: report.orphanedTextSelections.length,
    correctionsNeedingReview: report.correctionsNeedingReview.length,
  });
} finally {
  await pool.end();
}
