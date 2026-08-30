import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router';

import { server } from '../../mocks/node';
import { renderWithProviders } from '../test/renderWithProviders';

import { WebDatingScreen } from './WebDatingScreen';

const renderAt = (url: string) =>
  renderWithProviders(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/dates-site" element={<WebDatingScreen />} />
      </Routes>
    </MemoryRouter>,
  );

describe('v1.5, Task 12 — dating the site’s undated pages', () => {
  test('la proposition s’affiche À CÔTÉ du champ, qui reste vide', async () => {
    renderAt('/dates-site');
    const ligne = await screen.findByTestId('web-doc-web/2003/2003_gal_15');
    expect(within(ligne).getByLabelText('Premier jour')).toHaveValue('');
    expect(within(ligne).getByTestId('proposal')).toHaveTextContent('05/10/2004');
  });

  test('la proposition dit sur quoi elle repose', async () => {
    renderAt('/dates-site');
    const forte = within(await screen.findByTestId('web-doc-web/2003/2003_gal_15'))
      .getByTestId('proposal');
    expect(forte).toHaveTextContent(/20 photos/);
    expect(forte).toHaveTextContent(/toutes au jour/);
    expect(forte).toHaveTextContent(/9 jours/);

    const faible = within(await screen.findByTestId('web-doc-web/photo')).getByTestId('proposal');
    expect(faible).toHaveTextContent(/1 photo/);
    expect(faible).toHaveTextContent(/au mois/);
  });

  test('« adopter cette date » recopie la proposition dans le champ, en un clic', async () => {
    const user = userEvent.setup();
    renderAt('/dates-site');
    const ligne = await screen.findByTestId('web-doc-web/2003/2003_gal_15');
    await user.click(within(ligne).getByRole('button', { name: 'Adopter cette date' }));
    expect(within(ligne).getByLabelText('Premier jour')).toHaveValue('2004-10-05');
  });

  test('une date saisie se rend en inférence, jamais en décision', async () => {
    renderAt('/dates-site');
    const ligne = await screen.findByTestId('web-doc-web/1999/Transat');
    // Plan deviation (same as PageList's sort test): ResolvedDate.tsx's real
    // attribute is `data-date-kind`, never `data-kind`.
    expect(await within(ligne).findByTestId('resolved-date')).toHaveAttribute(
      'data-date-kind', 'inference',
    );
  });

  test('la saisie n’envoie qu’une borne de début', async () => {
    const user = userEvent.setup();
    let sent: unknown = null;
    server.use(http.put('*/ref/web-span', async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json({
        id: 'web/1999/Transat', kind: 'html', title: 'Transat', pageCount: null,
        passageCount: 10,
        span: {
          start: '1999-11-10', end: '1999-11-10', precision: 'day',
          kind: 'inference', source: 'web_span', bracketHours: null,
        },
        hasPages: false,
      });
    }));

    renderAt('/dates-site');
    const ligne = await screen.findByTestId('web-doc-web/1999/Transat');
    await user.type(within(ligne).getByLabelText('Premier jour'), '1999-11-10');
    await user.click(within(ligne).getByRole('button', { name: 'Enregistrer' }));

    await screen.findByTestId('web-doc-web/1999/Transat');
    expect(sent).toEqual({ documentId: 'web/1999/Transat', dateFrom: '1999-11-10', note: null });
  });

  test('l’écran s’en tient au périmètre, les rebuts derrière « voir tout »', async () => {
    const user = userEvent.setup();
    renderAt('/dates-site');
    await screen.findByTestId('web-doc-web/1999/Transat');
    expect(screen.queryByTestId('web-doc-web/googlea0ccc7e24963cc5e')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Voir tout' }));
    expect(await screen.findByTestId('web-doc-web/googlea0ccc7e24963cc5e')).toBeInTheDocument();
  });
});
