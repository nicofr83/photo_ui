import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';

import { renderWithProviders } from '../test/renderWithProviders';

import { AppRoutes } from './router';

/** Test-only: makes the current URL assertable without reaching into history. */
function LocationProbe(): React.JSX.Element {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}{location.search}</p>;
}

function setup(url: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[url]}>
      <LocationProbe />
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('the texts screen is reachable, task-scoped', () => {
  test('/textes/:slug renders it, with the task nav carrying the slug', async () => {
    setup('/textes/1999-transat');
    // v1.5, Task 8: the default source is the logbook — its page list, not a
    // named region, is what proves the screen actually rendered.
    expect(await screen.findByTestId('page-logbook/p003')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: /écrans de la tâche/i });
    expect(within(nav).getByRole('link', { name: /textes/i })).toHaveAttribute(
      'href', '/textes/1999-transat',
    );
    expect(within(nav).getByRole('link', { name: /images/i })).toHaveAttribute(
      'href', '/images/1999-transat',
    );
  });

  test('opening a passage’s photo navigates to the grid, pre-filtered on its overlap window', async () => {
    // V1.7: the registre became a table with no "N images" button of its
    // own (spec's four fixed columns) — the journal's free-prose passages
    // (kept as `TextCard`s below the table, pending team-lead's answer on
    // where they belong) still carry it, and still prove this navigation.
    const user = userEvent.setup();
    setup('/textes/1999-transat?source=logbook');

    const page = await screen.findByTestId('page-logbook/p003');
    await user.click(within(page).getByRole('button'));
    const card = await screen.findByTestId('text-passage-logbook/p003/001');
    await user.click(within(card).getByRole('button', { name: /images/ }));

    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/images/1999-transat?overlapsTextKind=passage&overlapsTextId=logbook%2Fp003%2F001',
    );
  });
});
