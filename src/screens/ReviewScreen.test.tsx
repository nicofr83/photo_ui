import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import { store } from '../../mocks/store';
import { parseIsoTimestamp } from '../shared/date_interface';
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
    });

    setup();
    await user.click(await screen.findByRole('button', { name: /^Exporter/ }));
    const report = await screen.findByTestId('export-report');
    expect(report).toHaveTextContent('sans-vignette.jpg');
    expect(report).toHaveTextContent(/introuvable|source_file_missing/);
    // It continued: something was written.
    expect(report).toHaveTextContent(/1 image écrite/);
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
