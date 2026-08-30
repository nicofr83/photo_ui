import { expect, test } from 'vitest';

import { pageThumbCachePath, sanitizePageId } from './thumb_service.ts';

test('sanitizePageId strips every character that is not a-z/0-9 — no separator survives', () => {
  expect(sanitizePageId('logbook/p010')).toBe('logbook_p010');
  expect(sanitizePageId('ma-vie/p001')).toBe('ma_vie_p001');
});

test('sanitizePageId defeats a path-traversal attempt by construction', () => {
  expect(sanitizePageId('../../etc/passwd')).not.toContain('/');
  expect(sanitizePageId('../../etc/passwd')).not.toContain('..');
});

test('pageThumbCachePath is stable for the same pageId and edge, distinct across either', () => {
  const a = pageThumbCachePath('/cache', 'logbook/p010', 320);
  const b = pageThumbCachePath('/cache', 'logbook/p010', 320);
  expect(a).toBe(b);
  expect(a).toBe('/cache/pages/logbook_p010-320.jpg');
  expect(pageThumbCachePath('/cache', 'logbook/p010', 640)).not.toBe(a);
  expect(pageThumbCachePath('/cache', 'logbook/p011', 320)).not.toBe(a);
});
