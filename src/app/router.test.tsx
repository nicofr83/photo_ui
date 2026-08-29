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
    expect(await screen.findByRole('region', { name: /journal de bord/i })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: /écrans de la tâche/i });
    expect(within(nav).getByRole('link', { name: /textes/i })).toHaveAttribute(
      'href', '/textes/1999-transat',
    );
    expect(within(nav).getByRole('link', { name: /images/i })).toHaveAttribute(
      'href', '/images/1999-transat',
    );
  });

  test('opening a passage’s photos navigates to the grid, pre-filtered on its overlap window', async () => {
    const user = userEvent.setup();
    setup('/textes/1999-transat');

    const card = await screen.findByTestId('text-passage-logbook/p003/001');
    await user.click(within(card).getByRole('button', { name: /11 photos/ }));

    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/images/1999-transat?overlapsTextKind=passage&overlapsTextId=logbook%2Fp003%2F001',
    );
  });
});
