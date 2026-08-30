import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';

import { server } from '../../mocks/node';
import { store } from '../../mocks/store';
import { parseIsoDate, parseIsoTimestamp } from '../shared/date_interface';
import { renderWithProviders } from '../test/renderWithProviders';

import { ReviewScreen } from './ReviewScreen';

// ReviewScreen renders TaskNav, which needs a Router — the real app always
// provides one (app/router.tsx), so the test does too.
const setup = () =>
  renderWithProviders(<MemoryRouter><ReviewScreen slug="1999-transat" /></MemoryRouter>);

describe('§5.6 — what is held is shown', () => {
  test('the retained images are listed', async () => {
    setup();
    expect(await screen.findByTestId('review-image-e8bc80b75e254b7db2e1454222416813'))
      .toBeInTheDocument();
  });

  test('Q6 — the default order is chronological, and it is stated', async () => {
    setup();
    expect(await screen.findByTestId('order-note')).toHaveTextContent(/chronologique/i);
  });

  test('removing an image takes it out of the export', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: /Retirer scan-0007/ }));
    await waitFor(() => {
      expect(screen.queryByTestId('review-image-e8bc80b75e254b7db2e1454222416813'))
        .not.toBeInTheDocument();
    });
  });
});

describe('spec §5.6/Q6 — the manifest order is reorderable', () => {
  test('the single image cannot move: both controls are disabled', async () => {
    setup();
    const row = await screen.findByTestId('review-image-e8bc80b75e254b7db2e1454222416813');
    expect(within(row).getByRole('button', { name: /monter/i })).toBeDisabled();
    expect(within(row).getByRole('button', { name: /descendre/i })).toBeDisabled();
  });

  test('moving the first image down swaps it with the second', async () => {
    const user = userEvent.setup();
    const task = store.tasks.get('1999-transat');
    task?.images.push({
      cloudAssetId: '05b9a4fac5df4dd28dcc1002d7ec0074',
      order: 1, note: null, selectedBecause: ['manual'],
      selectedAt: parseIsoTimestamp('2026-08-29T10:00:00.000Z'), orphaned: false,
      outOfPeriod: false,
    });

    setup();
    const list = await screen.findByRole('list', { name: /images de la tâche/i });
    const firstRow = within(list).getAllByRole('listitem')[0];
    if (firstRow === undefined) throw new Error('expected at least one row');
    await user.click(within(firstRow).getByRole('button', { name: /descendre/i }));

    await waitFor(() => {
      const rows = within(list).getAllByRole('listitem');
      expect(rows[0]?.dataset['testid']).toBe(
        'review-image-05b9a4fac5df4dd28dcc1002d7ec0074',
      );
    });
  });
});

describe('§5.6 — exporting', () => {
  test('a successful export names the directory it wrote', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: /^Exporter/ }));
    expect(await screen.findByTestId('export-report')).toHaveTextContent('/tasks/1999-transat');
  });

  test('an image that would not render does NOT stop the export, and is named with its cause', async () => {
    const user = userEvent.setup();
    // Put the unrenderable photo into the task.
    const task = store.tasks.get('1999-transat');
    task?.images.push({
      cloudAssetId: '708192a3b4c5d6e7f809112233445566',
      order: 1, note: null, selectedBecause: ['manual'],
      selectedAt: parseIsoTimestamp('2026-08-29T10:00:00.000Z'), orphaned: false,
      outOfPeriod: false,
    });

    setup();
    await user.click(await screen.findByRole('button', { name: /^Exporter/ }));
    const report = await screen.findByTestId('export-report');
    // No fileName on a skipped image (server/src/contract/task_interface.ts
    // TaskExportReport.skippedImages) — only the id it could not resolve.
    expect(report).toHaveTextContent('708192a3');
    expect(report).toHaveTextContent(/introuvable|source_file_missing/i);
    // It continued: something was written.
    expect(report).toHaveTextContent(/1 image écrite/);
  });

  test('a running job shows a status while it is polled, before the report lands', async () => {
    const user = userEvent.setup();
    const running = {
      id: 'job_running', type: 'export' as const, state: 'running' as const,
      createdAt: '2026-08-29T10:00:00.000Z', startedAt: '2026-08-29T10:00:00.000Z', finishedAt: null,
      progress: { done: 0, total: 1, label: null }, cancellable: false, result: null, error: null,
    };
    const succeeded = {
      ...running, state: 'succeeded' as const, finishedAt: '2026-08-29T10:00:01.000Z',
      progress: { done: 1, total: 1, label: null },
      result: {
        type: 'export' as const,
        report: {
          directory: '/tasks/1999-transat', manifestPath: '/tasks/1999-transat/manifest.json',
          imagesWritten: 1, pagesWritten: 0, textsWritten: 0, notesWritten: 0, bytesWritten: 10,
          skippedImages: [], partial: false, exportedAt: '2026-08-29T10:00:01.000Z',
        },
      },
    };
    // POST answers 202 with the job still running — exportTask() truly runs
    // inside the async job runner, spec §7.4 — and the first poll confirms
    // that before a second poll turns it terminal.
    server.use(http.post('*/tasks/:slug/export', () => HttpResponse.json(running, { status: 202 })));
    let polls = 0;
    server.use(http.get('*/jobs/job_running', () => {
      polls += 1;
      return HttpResponse.json(polls === 1 ? running : succeeded);
    }));

    setup();
    await user.click(await screen.findByRole('button', { name: /^Exporter/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('Export en cours');
    expect(await screen.findByTestId('export-report')).toBeInTheDocument();
  });

  test('an existing directory is NAMED and never overwritten in silence', async () => {
    const user = userEvent.setup();
    store.exportDirectoryExists = true;
    setup();
    await user.click(await screen.findByRole('button', { name: /^Exporter/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('/tasks/1999-transat');
    expect(screen.queryByTestId('export-report')).not.toBeInTheDocument();
  });

  test('overwriting is an explicit second gesture', async () => {
    const user = userEvent.setup();
    store.exportDirectoryExists = true;
    setup();
    await user.click(await screen.findByRole('button', { name: /^Exporter/ }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: /Écraser/ }));
    expect(await screen.findByTestId('export-report')).toBeInTheDocument();
  });
});

describe('spec §5.6 — the control banner and the chronology', () => {
  test('the banner and its eight counters render', async () => {
    setup();
    expect(await screen.findByRole('list', { name: /bandeau de contrôle/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { pressed: false }).length).toBeGreaterThanOrEqual(8);
  });

  test('the chronology places the one dated seed image', async () => {
    setup();
    expect(await screen.findByTestId('chronology-e8bc80b75e254b7db2e1454222416813'))
      .toBeInTheDocument();
  });

  test('clicking a counter highlights only the matching chronology entries', async () => {
    const user = userEvent.setup();
    // 2b3c4d… is dated by a rank-3 LOGBOOK_BRACKET proposal — an inference.
    // The seed image (e8bc…) is an ANNOTATION — a decision, not an inference.
    const task = store.tasks.get('1999-transat');
    task?.images.push({
      cloudAssetId: '2b3c4d5e6f708192a3b4c5d6e7f80911',
      order: 1, note: null, selectedBecause: ['manual'],
      selectedAt: parseIsoTimestamp('2026-08-29T10:00:00.000Z'), orphaned: false,
      outOfPeriod: false,
    });

    setup();
    await screen.findByTestId('chronology-2b3c4d5e6f708192a3b4c5d6e7f80911');
    await user.click(screen.getByRole('button', { name: /photos à date déduite/i }));

    expect(screen.getByTestId('chronology-2b3c4d5e6f708192a3b4c5d6e7f80911').className)
      .not.toMatch(/dimmed/);
    expect(screen.getByTestId('chronology-e8bc80b75e254b7db2e1454222416813').className)
      .toMatch(/dimmed/);
  });

  test('clicking again clears the highlight', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByTestId('chronology-e8bc80b75e254b7db2e1454222416813');
    const button = screen.getByRole('button', { name: /photos sans date/i });
    await user.click(button);
    await user.click(button);
    expect(screen.getByTestId('chronology-e8bc80b75e254b7db2e1454222416813').className)
      .not.toMatch(/dimmed/);
  });

  test('imagesOutOfPeriod highlights only images dated outside the declared period', async () => {
    const user = userEvent.setup();
    const task = store.tasks.get('1999-transat');
    if (task !== undefined) {
      task.period = { from: parseIsoDate('2005-01-01'), to: parseIsoDate('2005-12-31') };
    }

    setup();
    await screen.findByTestId('chronology-e8bc80b75e254b7db2e1454222416813');
    await user.click(screen.getByRole('button', { name: /photos hors période/i }));

    // The seed image is dated 1999-03-02 — outside the 2005 period.
    expect(screen.getByTestId('chronology-e8bc80b75e254b7db2e1454222416813').className)
      .not.toMatch(/dimmed/);
  });

  test('uncertainTexts highlights only texts marked uncertain', async () => {
    const user = userEvent.setup();
    const task = store.tasks.get('1999-transat');
    task?.texts.push({
      ref: { kind: 'passage', id: 'logbook/p003/001' }, // TranscriptionConfidence.UNCERTAIN
      order: 0, selectedAt: parseIsoTimestamp('2026-08-29T10:00:00.000Z'), orphaned: false,
      startOffset: null, endOffset: null,
    });

    setup();
    await screen.findByTestId('chronology-e8bc80b75e254b7db2e1454222416813');
    await user.click(screen.getByRole('button', { name: /textes incertains/i }));

    expect(screen.getByTestId('chronology-passage:logbook/p003/001').className)
      .not.toMatch(/dimmed/);
  });
});

describe('spec §5.1/§9 — the export is blocked while the originals volume is unmounted', () => {
  test('export stays enabled while the volume is available', async () => {
    setup();
    expect(await screen.findByRole('button', { name: /^Exporter/ })).toBeEnabled();
    expect(screen.queryByTestId('export-blocked')).not.toBeInTheDocument();
  });

  test('export is disabled, with a stated reason, once it is unmounted', async () => {
    store.originalsAvailable = false;
    setup();
    expect(await screen.findByTestId('export-blocked')).toHaveTextContent(/absent/i);
    expect(screen.getByRole('button', { name: /^Exporter/ })).toBeDisabled();
  });
});

describe('§5.6 — the brief travels with the task', () => {
  test('the brief is editable', async () => {
    const user = userEvent.setup();
    setup();
    const field = await screen.findByLabelText(/consigne/i);
    await user.type(field, 'Raconter la traversée');
    expect(field).toHaveValue('Raconter la traversée');
  });
});
