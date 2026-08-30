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

  test('opening a gallery caption’s photo navigates to the grid, pre-filtered on its overlap window', async () => {
    // v1.5, Task 8: a passage's own "N photos" button now lives behind
    // opening its page (PageDetail, Task 9) — a gallery caption stays
    // directly reachable under the web source, so it still proves this
    // navigation without depending on that later task.
    const user = userEvent.setup();
    setup('/textes/1999-transat?source=web');

    const card = await screen.findByTestId(
      'text-web_caption-web/2003/2003_gal_1/caption/000a86651c47',
    );
    await user.click(within(card).getByRole('button', { name: /1 images/ }));

    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/images/1999-transat?overlapsTextKind=web_caption'
      + '&overlapsTextId=web%2F2003%2F2003_gal_1%2Fcaption%2F000a86651c47',
    );
  });
});
