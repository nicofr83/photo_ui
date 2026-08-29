import { describe, expect, test } from 'vitest';

import { loadConfig } from './config.ts';

/** Un environnement complet, dont on retire une variable à la fois. */
const complete = {
  DATABASE_URL: 'postgres://nico@localhost:5432/photo_ui',
  ORIGINALS_ROOT: '/tmp/originals',
  THUMBS_ROOT: '/tmp/thumbs',
  PIPELINE_DB_ROOT: '/tmp/work',
  PAGES_ROOT: '/tmp/pages',
  ANNOTATIONS_DIR: '/tmp/annotations',
  WEB_GALLERY_ROOT: '/tmp/web-gallery',
  RENDER_CACHE_ROOT: '/tmp/cache',
  TASKS_ROOT: '/tmp/tasks',
};

describe('loadConfig', () => {
  test('names the missing variable rather than failing vaguely', () => {
    const { RENDER_CACHE_ROOT: _omitted, ...incomplete } = complete;
    expect(() => loadConfig(incomplete)).toThrow(/RENDER_CACHE_ROOT/);
  });

  test('names EVERY missing variable at once, not just the first', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL[\s\S]*TASKS_ROOT|TASKS_ROOT[\s\S]*DATABASE_URL/);
  });

  test('an empty string is missing, not a value', () => {
    expect(() => loadConfig({ ...complete, TASKS_ROOT: '   ' })).toThrow(/TASKS_ROOT/);
  });

  test('applies the documented defaults', () => {
    const config = loadConfig(complete);
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(4310);
    expect(config.renderEdge).toBe(1400);
    expect(config.renderConcurrency).toBe(8);
    expect(config.logLevel).toBe('info');
  });

  test('the dating export flag is OFF unless explicitly the string true', () => {
    expect(loadConfig(complete).featureDatingExport).toBe(false);
    expect(loadConfig({ ...complete, FEATURE_DATING_EXPORT: 'yes' }).featureDatingExport).toBe(false);
    expect(loadConfig({ ...complete, FEATURE_DATING_EXPORT: 'true' }).featureDatingExport).toBe(true);
  });

  test('the perimeter is a parameter, not a constant of the code', () => {
    expect(loadConfig(complete).perimeterSets)
      .toEqual(['1998-1999', '2000-2001', '2002', '2003', '2004']);
    expect(loadConfig(complete).periodFrom).toBe('1998-01-01');
    expect(loadConfig(complete).periodTo).toBe('2004-12-31');

    const narrowed = loadConfig({ ...complete, PERIOD_FROM: '1990-01-01', PERIOD_TO: '1995-12-31',
                                  PERIMETER_SETS: '1990-1991, 1992' });
    expect(narrowed.periodFrom).toBe('1990-01-01');
    expect(narrowed.periodTo).toBe('1995-12-31');
    expect(narrowed.perimeterSets).toEqual(['1990-1991', '1992']);
  });

  test('rejects a port that is not a number rather than coercing it to NaN', () => {
    expect(() => loadConfig({ ...complete, PHOTO_UI_PORT: 'quatre-mille' })).toThrow(/PHOTO_UI_PORT/);
  });

  test('the writable and read-only roots are two distinct lists', () => {
    const config = loadConfig(complete);
    expect(config.writableRoots).toEqual(['/tmp/cache', '/tmp/tasks']);
    expect(config.readOnlyRoots)
      .toEqual(['/tmp/originals', '/tmp/thumbs', '/tmp/work', '/tmp/pages', '/tmp/web-gallery']);
  });

  test('the annotations dir becomes WRITABLE only behind the flag', () => {
    expect(loadConfig(complete).writableRoots).not.toContain('/tmp/annotations');
    expect(loadConfig({ ...complete, FEATURE_DATING_EXPORT: 'true' }).writableRoots)
      .toContain('/tmp/annotations');
  });
});
