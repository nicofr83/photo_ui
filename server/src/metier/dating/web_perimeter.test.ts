import { expect, test } from 'vitest';

import { isInWebPerimeter } from './web_perimeter.ts';

const PERIOD_FROM = 1998;
const PERIOD_TO = 2004;

test('a document with fewer than two passages is never in perimeter, whatever its date', () => {
  expect(isInWebPerimeter({ documentId: 'web/1999/bidon', passageCount: 1, proposalDate: '1999-01-01' },
    PERIOD_FROM, PERIOD_TO)).toBe(false);
});

test('a year in the path within the period is enough, on its own', () => {
  expect(isInWebPerimeter({ documentId: 'web/1999/Transat', passageCount: 49, proposalDate: null },
    PERIOD_FROM, PERIOD_TO)).toBe(true);
});

test('a year in the path OUTSIDE the period, with no in-period proposal, is excluded', () => {
  expect(isInWebPerimeter({ documentId: 'web/2005/3/raiders/nico', passageCount: 2, proposalDate: null },
    PERIOD_FROM, PERIOD_TO)).toBe(false);
});

test('a path with no parseable year and no proposal is excluded — no signal either way', () => {
  expect(isInWebPerimeter({ documentId: 'web/googlea0ccc7e24963cc5e', passageCount: 2, proposalDate: null },
    PERIOD_FROM, PERIOD_TO)).toBe(false);
});

test('an out-of-period path is rescued by an in-period proposal — the two are independent signals', () => {
  expect(isInWebPerimeter(
    { documentId: 'web/2005/images/2005_4', passageCount: 2, proposalDate: '2003-05-16' },
    PERIOD_FROM, PERIOD_TO,
  )).toBe(true);
});

test('a path with no year at all is rescued by an in-period proposal', () => {
  expect(isInWebPerimeter({ documentId: 'web/photo', passageCount: 10, proposalDate: '2000-12-01' },
    PERIOD_FROM, PERIOD_TO)).toBe(true);
});

test('a proposal outside the period does not rescue a path outside the period', () => {
  expect(isInWebPerimeter(
    { documentId: 'web/2005/2005_3', passageCount: 16, proposalDate: '2005-08-04' },
    PERIOD_FROM, PERIOD_TO,
  )).toBe(false);
});

test('a spurious 4-digit run outside any plausible year range is never mistaken for a path year', () => {
  // "e24963cc5e" contient "2496" — hors de toute plage plausible.
  expect(isInWebPerimeter({ documentId: 'web/googlea0ccc7e24963cc5e', passageCount: 5, proposalDate: null },
    2400, 2500)).toBe(false);
});
