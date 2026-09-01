import { screen, within } from '@testing-library/react';
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

  // V1.7, Nicolas's ruling (2026-09-01): the journal's free-prose passages
  // get "le traitement de Ma vie" — free selection, `PageProse`, no
  // per-passage `TextCard`. That retires the last reachable "N images"
  // button anywhere in the app (the registre table never had one, spec's
  // four fixed columns; the generic `PageDetail`/`WebDocumentDetail` that
  // still wire it were already unreachable, superseded by
  // `JournalPageDetail`/`SiteWebReader`) — confirmed via a targeted search
  // before removing `TextsScreen`'s own now-dead `onShowPhotos` plumbing.
  // Nothing left in the real app exercises this navigation to test against.
});
