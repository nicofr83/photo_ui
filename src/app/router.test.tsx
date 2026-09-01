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

  // V1.7, Nicolas's ruling (2026-09-01): the overlap-navigation button came
  // back on the registre table alone — a registre line has a precise date
  // (narrow, usable window); a prose passage only inherits its page's
  // (1 to 30+ days), so it never gets one (`JournalRow`'s own doc comment
  // has the technical reason). This restores the router-level proof that
  // was removed when the previous entry point (`TextCard`'s own button,
  // reached through the journal's free-prose section) disappeared.
  test('opening a registre line’s "N ▸" navigates to the grid, pre-filtered on its overlap window', async () => {
    const user = userEvent.setup();
    setup('/textes/1999-transat?source=logbook');

    const page = await screen.findByTestId('page-logbook/p003');
    await user.click(within(page).getByRole('button'));
    const button = await screen.findByRole('button', { name: /voir les .* photos/i });
    await user.click(button);

    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/images/1999-transat?overlapsTextKind=log_entry&overlapsTextId=logbook%2Fp003%2F001',
    );
  });
});
