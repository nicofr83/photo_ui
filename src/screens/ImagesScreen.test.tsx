import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';

import { renderWithProviders } from '../test/renderWithProviders';

import { ImagesScreen } from './ImagesScreen';

function setup(initialUrl = '/images/1999-transat') {
  return renderWithProviders(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/images/:slug" element={<ImagesScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('the screen composes filters, grid and selection', () => {
  test('the grid loads', async () => {
    setup();
    await waitFor(() => { expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(5); });
  });

  test('the filter panel is present', async () => {
    setup();
    expect(await screen.findByLabelText(/premier mois/i)).toBeInTheDocument();
  });
});

describe('INVARIANT §6.5 — a filter lives in the URL, so it cannot vanish quietly', () => {
  test('a filter arriving in the URL is applied and shown as a token', async () => {
    setup('/images/1999-transat?dateFrom=2004-01-01&dateTo=2004-12-31');
    expect(await screen.findByTestId('filter-token-dates')).toHaveTextContent('2004-01-01');
    const header = await screen.findByTestId('selection-header');
    expect(header).toHaveTextContent(/1 résultat/);
  });

  test('an unknown parameter in the URL is dropped rather than sent to the server', async () => {
    setup('/images/1999-transat?colour=grey');
    // If it were forwarded the server would answer 400 and we would see an alert.
    expect(await screen.findByTestId('selection-header')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('selection round-trips through the task', () => {
  test('the photo already held by the task starts checked', async () => {
    setup();
    const tile = await screen.findByLabelText(/Sélectionner scan-0007\.jpg/);
    expect(tile).toBeChecked();
  });

  test('selecting a photo persists it', async () => {
    const user = userEvent.setup();
    setup();
    const tile = await screen.findByLabelText(/Sélectionner PICT0042\.jpg/);
    await user.click(tile);
    await waitFor(() => {
      expect(screen.getByLabelText(/Sélectionner PICT0042\.jpg/)).toBeChecked();
    });
  });

  test('select-all acts on the filter and not on the page', async () => {
    const user = userEvent.setup();
    setup('/images/1999-transat?dateFrom=2004-01-01&dateTo=2004-12-31');
    await user.click(await screen.findByRole('button', { name: /Sélectionner le 1 résultat/ }));
    await waitFor(() => {
      expect(screen.getByLabelText(/Sélectionner DSCN2201\.jpg/)).toBeChecked();
    });
  });
});

describe('the detail panel opens from the grid', () => {
  test('opening a photo shows its detail, and closing returns to the grid', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: /Détail de PICT0042\.jpg/ }));
    const panel = await screen.findByTestId('main-date');
    expect(within(panel).getByTestId('resolved-date')).toHaveTextContent('1999-10-14');
    await user.click(screen.getByRole('button', { name: /Fermer/ }));
    await waitFor(() => { expect(screen.queryByTestId('main-date')).not.toBeInTheDocument(); });
  });
});
