import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { server } from '../../../mocks/node';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { TextUnit } from '../../api/contract/text';
import { parseIsoDate, parseIsoTimestamp } from '../../shared/date_interface';
import {
  CorrectionStatus, DateKind, DatePrecision, DateSource, PageSpanSource, TextKind,
  TranscriptionConfidence,
} from '../../shared/enums';

import { TextCard } from './TextCard';

const reading = (day: string) => ({
  start: parseIsoDate(day), end: parseIsoDate(day), precision: DatePrecision.DAY,
  kind: DateKind.READING, source: DateSource.LOG_ENTRY_DATE, bracketHours: null,
});
const singleDay = (raw: string) => ({ start: parseIsoDate(raw), end: parseIsoDate(raw) });

const baseUnit: TextUnit = {
  ref: { kind: TextKind.PASSAGE, id: 'logbook/p010/011' },
  documentId: 'logbook', pageId: 'logbook/p010', ordinal: 11,
  text: 'Route au 090.', textOriginal: 'Route au 090.',
  correction: null,
  confidence: TranscriptionConfidence.TRANSCRIBED,
  date: reading('2000-01-02'),
  dateOriginal: reading('2000-01-02'),
  pageSpanSource: PageSpanSource.ENTRIES,
  overlappingPhotoCount: 0,
  highlights: [], logEntry: null, galleryCaption: null,
};

describe('V1.6, Nicolas #3 — correcting a text also lets you correct its date', () => {
  test('editing offers a date field, prefilled with the current date', async () => {
    renderWithProviders(<TextCard unit={baseUnit} />);
    await userEvent.click(screen.getByRole('button', { name: /corriger/i }));
    expect(screen.getByLabelText('Date')).toHaveValue('2000-01-02');
  });

  test('an undated text offers an empty date field, never a fabricated day', async () => {
    renderWithProviders(<TextCard unit={{ ...baseUnit, date: null, dateOriginal: null }} />);
    await userEvent.click(screen.getByRole('button', { name: /corriger/i }));
    expect(screen.getByLabelText('Date')).toHaveValue('');
  });

  test('changing the date and saving sends it as a single-day correction', async () => {
    const user = userEvent.setup();
    let sent: unknown = null;
    server.use(http.put('*/corrections', async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json({
        ...baseUnit,
        text: baseUnit.text,
        date: { ...reading('2003-11-04'), kind: DateKind.DECISION, source: DateSource.ANNOTATION },
        correction: {
          ref: baseUnit.ref, text: baseUnit.text, originalAtCorrection: baseUnit.textOriginal,
          date: singleDay('2003-11-04'),
          originalDateAtCorrection: singleDay('2000-01-02'),
          correctedAt: parseIsoTimestamp('2026-08-31T09:00:00.000Z'), status: CorrectionStatus.APPLIED,
        },
      });
    }));

    renderWithProviders(<TextCard unit={baseUnit} />);
    await user.click(screen.getByRole('button', { name: /corriger/i }));
    const dateField = screen.getByLabelText('Date');
    await user.clear(dateField);
    await user.type(dateField, '2003-11-04');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => { expect(sent).not.toBeNull(); });
    expect(sent).toMatchObject({
      ref: baseUnit.ref,
      text: 'Route au 090.',
      date: singleDay('2003-11-04'),
    });
  });

  test('clearing the date field and saving sends date: null — never omitted, never a stale value', async () => {
    const user = userEvent.setup();
    let sent: unknown = null;
    const withCorrection: TextUnit = {
      ...baseUnit,
      date: { ...reading('2003-11-04'), kind: DateKind.DECISION, source: DateSource.ANNOTATION },
      correction: {
        ref: baseUnit.ref, text: baseUnit.text, originalAtCorrection: baseUnit.textOriginal,
        date: singleDay('2003-11-04'),
        originalDateAtCorrection: singleDay('2000-01-02'),
        correctedAt: parseIsoTimestamp('2026-08-31T09:00:00.000Z'), status: CorrectionStatus.APPLIED,
      },
    };
    server.use(http.put('*/corrections', async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json({ ...baseUnit, correction: null });
    }));

    renderWithProviders(<TextCard unit={withCorrection} />);
    await user.click(screen.getByRole('button', { name: /corriger/i }));
    await user.clear(screen.getByLabelText('Date'));
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => { expect(sent).not.toBeNull(); });
    expect((sent as { date: unknown }).date).toBeNull();
  });

  test('a corrected date renders as a decision, and the original stays visible alongside', () => {
    const withCorrection: TextUnit = {
      ...baseUnit,
      date: { ...reading('2003-11-04'), kind: DateKind.DECISION, source: DateSource.ANNOTATION },
      correction: {
        ref: baseUnit.ref, text: baseUnit.text, originalAtCorrection: baseUnit.textOriginal,
        date: singleDay('2003-11-04'),
        originalDateAtCorrection: singleDay('2000-01-02'),
        correctedAt: parseIsoTimestamp('2026-08-31T09:00:00.000Z'), status: CorrectionStatus.APPLIED,
      },
    };
    renderWithProviders(<TextCard unit={withCorrection} />);

    const dateBlock = screen.getByTestId('text-date');
    expect(within(dateBlock).getByTestId('resolved-date')).toHaveAttribute('data-date-kind', 'decision');
    expect(screen.getByTestId('date-original')).toHaveTextContent('2000-01-02');
  });

  test('no date-original shown when only the text was corrected — nothing to witness', () => {
    const textOnlyCorrection: TextUnit = {
      ...baseUnit,
      correction: {
        ref: baseUnit.ref, text: baseUnit.text, originalAtCorrection: 'Route au 090 (brouillon).',
        date: null, originalDateAtCorrection: null,
        correctedAt: parseIsoTimestamp('2026-08-31T09:00:00.000Z'), status: CorrectionStatus.APPLIED,
      },
    };
    renderWithProviders(<TextCard unit={textOnlyCorrection} />);
    expect(screen.queryByTestId('date-original')).not.toBeInTheDocument();
  });

  test('reverting clears the date correction too, in the same gesture as the text', async () => {
    const user = userEvent.setup();
    let reverted = false;
    const withCorrection: TextUnit = {
      ...baseUnit,
      date: { ...reading('2003-11-04'), kind: DateKind.DECISION, source: DateSource.ANNOTATION },
      correction: {
        ref: baseUnit.ref, text: baseUnit.text, originalAtCorrection: baseUnit.textOriginal,
        date: singleDay('2003-11-04'),
        originalDateAtCorrection: singleDay('2000-01-02'),
        correctedAt: parseIsoTimestamp('2026-08-31T09:00:00.000Z'), status: CorrectionStatus.APPLIED,
      },
    };
    server.use(http.post('*/corrections/revert', () => {
      reverted = true;
      return HttpResponse.json({ ...baseUnit, correction: null });
    }));

    renderWithProviders(<TextCard unit={withCorrection} />);
    await user.click(screen.getByRole('button', { name: /rétablir/i }));
    await waitFor(() => { expect(reverted).toBe(true); });
  });
});
