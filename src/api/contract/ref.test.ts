import { WebDocumentRowSchema, WebSpanPutInputSchema } from './ref';

const row = {
  documentId: 'web/1999/Transat', title: 'Transat', passageCount: 49,
  excerpt: 'Transat', pathHint: 'web/1999/Transat', proposal: null,
};

describe('v1.5 — a web document only chains through DATED neighbours, never document_id', () => {
  test('a site document with no span entered has NO period at all', () => {
    // The chaining is between DATED documents, by date. document_id plays no
    // role, and an undated document does not get rescued by inheritance:
    // stubs and empty templates come back with no date, period.
    expect(WebDocumentRowSchema.parse({ ...row, span: null }).span).toBeNull();
  });

  test('a span entered on a site document is an inference', () => {
    const parsed = WebDocumentRowSchema.parse({
      ...row,
      span: { start: '1999-11-10', end: '1999-12-31', precision: 'day',
              kind: 'inference', source: 'web_span', bracketHours: null },
    });
    expect(parsed.span?.kind).toBe('inference');
  });
});

describe('v1.5 — WebDocumentRow.proposal, what the dating proposal is worth', () => {
  test('a document with no dated neighbour to propose from has none', () => {
    expect(WebDocumentRowSchema.parse({ ...row, span: null, proposal: null }).proposal).toBeNull();
  });

  test('a proposal names the date it would apply and what supports it', () => {
    const parsed = WebDocumentRowSchema.parse({
      ...row,
      span: null,
      proposal: {
        date: '1999-11-09', photoCount: 12, datedToDayCount: 8, spanDays: 3,
        thumbSha256: 'a'.repeat(64),
      },
    });
    expect(parsed.proposal).toEqual({
      date: '1999-11-09', photoCount: 12, datedToDayCount: 8, spanDays: 3,
      thumbSha256: 'a'.repeat(64),
    });
  });
});

describe('v1.6, contract A11 — a proposal’s thumbnail is a real photo, never a screenshot', () => {
  test('thumbSha256 is required whenever a proposal exists — no thumbnail is silently missing', () => {
    expect(() =>
      WebDocumentRowSchema.parse({
        ...row,
        span: null,
        proposal: { date: '1999-11-09', photoCount: 12, datedToDayCount: 8, spanDays: 3 },
      }),
    ).toThrow();
  });

  test('a document with no proposal has no thumbnail at all, never a fabricated one', () => {
    expect(WebDocumentRowSchema.parse({ ...row, span: null, proposal: null }).proposal).toBeNull();
  });
});

describe('v1.5 — a web span is a single START bound, never dateTo', () => {
  test('WebSpanPutInput no longer accepts dateTo', () => {
    expect(() =>
      WebSpanPutInputSchema.parse({
        documentId: 'web/1999/Transat', dateFrom: '1999-11-10', dateTo: '1999-12-31', note: null,
      }),
    ).toThrow(/Unrecognized key.*dateTo/);
  });

  test('a single dateFrom, with an optional note, is a valid input', () => {
    const parsed = WebSpanPutInputSchema.parse({
      documentId: 'web/1999/Transat', dateFrom: '1999-11-10', note: null,
    });
    expect(parsed).toEqual({ documentId: 'web/1999/Transat', dateFrom: '1999-11-10', note: null });
  });
});
