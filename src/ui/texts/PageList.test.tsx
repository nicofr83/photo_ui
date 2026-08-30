import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';

import { renderWithProviders } from '../../test/renderWithProviders';
import { TextsScreen } from '../../screens/TextsScreen';

const renderAt = (url: string) =>
  renderWithProviders(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/textes/:slug" element={<TextsScreen />} />
      </Routes>
    </MemoryRouter>,
  );

describe('v1.5, Task 8 — the source picker and the page list', () => {
  test('trois sources, une seule active', async () => {
    renderAt('/textes/tache-a');
    const picker = await screen.findByRole('group', { name: 'Source' });
    expect(within(picker).getAllByRole('radio').map((r) => r.getAttribute('value')))
      .toEqual(['logbook', 'ma-vie', 'web']);
  });

  test('une page porte sa date, son numéro et sa vignette', async () => {
    // Plan deviation: the plan's own snippet omits `?source=ma-vie` and
    // relies on an unstated default — the default source is `logbook`
    // (first in SourcePicker's own order, matching spec §5.3's listing
    // order), so these pages only render once the source is set explicitly.
    renderAt('/textes/tache-a?source=ma-vie');
    const ligne = await screen.findByTestId('page-ma-vie/p001');
    expect(within(ligne).getByText('page 1')).toBeInTheDocument();
    expect(within(ligne).getByRole('img'))
      .toHaveAttribute('src', '/pages/thumb?pageId=ma-vie%2Fp001&edge=160');
  });

  test('une date héritée se rend en inférence, une date propre en lecture', async () => {
    renderAt('/textes/tache-a?source=ma-vie');
    const propre = await screen.findByTestId('page-ma-vie/p001');
    const herite = await screen.findByTestId('page-ma-vie/p002');
    // Plan deviation: `ResolvedDateView` marks its nature with
    // `data-date-kind` (verified in `ResolvedDate.tsx`/`.test.tsx`), never
    // `data-kind` — that attribute name belongs to `Chronology.tsx`'s own,
    // unrelated entries.
    expect(within(propre).getByTestId('resolved-date')).toHaveAttribute('data-date-kind', 'reading');
    expect(within(herite).getByTestId('resolved-date')).toHaveAttribute('data-date-kind', 'inference');
  });

  test('le tri est chronologique par défaut, et bascule vers l’ordre du cahier', async () => {
    renderAt('/textes/tache-a?source=logbook');
    const parDate = (await screen.findAllByTestId(/^page-logbook/)).map((e) => e.dataset['ordinal']);
    await userEvent.click(screen.getByRole('button', { name: 'Ordre du cahier' }));
    const parPage = (await screen.findAllByTestId(/^page-logbook/)).map((e) => e.dataset['ordinal']);
    // Les pages 5 et 3 du journal s'inversent entre les deux ordres.
    expect(parDate).not.toEqual(parPage);
    expect(parPage).toEqual([...parPage].sort((a, b) => Number(a) - Number(b)));
  });

  test('le site web n’a pas de scan, et le dit', async () => {
    renderAt('/textes/tache-a?source=web');
    expect(await screen.findByTestId('no-pages')).toHaveTextContent(/pas de page scannée/i);
  });
});
