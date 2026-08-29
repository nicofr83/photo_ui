import { originalsUnavailable } from './systemStatus';

const status = (roots: { name: string; available: boolean }[]) => ({
  importId: 'x', importedAt: null, runningJobId: null,
  roots,
  counts: {
    photosInHierarchy: 0, photosOutOfHierarchy: 0, albums: 0, documents: 0,
    passages: 0, logEntries: 0,
  },
  prerender: { total: 0, done: 0, running: false },
  captions: { total: 0, done: 0, edited: 0, running: false },
  attention: {
    orphanedSelections: 0, correctionsNeedingReview: 0, correctionsOrphaned: 0,
    albumsWithPresumedSpan: 0, webDocumentsWithoutSpan: 0,
  },
  features: { datingExport: false },
}) as Parameters<typeof originalsUnavailable>[0];

describe('spec §5.1/§9 — the volume banner is about the ORIGINALS root specifically', () => {
  test('all roots available: no banner', () => {
    expect(originalsUnavailable(status([{ name: 'originals', available: true }]))).toBe(false);
  });

  test('originals unavailable: the banner applies', () => {
    expect(originalsUnavailable(status([{ name: 'originals', available: false }]))).toBe(true);
  });

  test('a DIFFERENT root being unavailable does not trigger it — thumbs/pages/tasks stay usable', () => {
    expect(originalsUnavailable(status([
      { name: 'originals', available: true },
      { name: 'thumbs', available: false },
    ]))).toBe(false);
  });

  test('originals missing from the list entirely is not treated as unavailable', () => {
    expect(originalsUnavailable(status([{ name: 'thumbs', available: true }]))).toBe(false);
  });
});
