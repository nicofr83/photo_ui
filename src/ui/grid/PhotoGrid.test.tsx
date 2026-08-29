import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { server } from '../../../mocks/node';
import { renderWithProviders } from '../../test/renderWithProviders';

import { PhotoGrid } from './PhotoGrid';

const params = (init: Record<string, string> = {}) => new URLSearchParams(init);

describe('the grid shows the corpus', () => {
  test('a tile per result', async () => {
    renderWithProviders(<PhotoGrid params={params()} selected={new Set()} onToggle={() => undefined} onSelectAll={() => undefined} />);
    await waitFor(() => { expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(5); });
  });

  test('it announces it is loading before it has results', () => {
    renderWithProviders(<PhotoGrid params={params()} selected={new Set()} onToggle={() => undefined} onSelectAll={() => undefined} />);
    expect(screen.getByRole('status')).toHaveTextContent(/chargement/i);
  });
});

describe('INVARIANT §7.3 and §6.5 — what was set aside is counted and shown', () => {
  test('the header shows results, selected and excluded', async () => {
    renderWithProviders(
      <PhotoGrid
        params={params({ dateFrom: '2004-01-01', dateTo: '2004-12-31' })}
        selected={new Set(['05b9a4fac5df4dd28dcc1002d7ec0074'])}
        onToggle={() => undefined}
        onSelectAll={() => undefined}
      />,
    );
    const header = await screen.findByTestId('selection-header');
    expect(header).toHaveTextContent(/1 résultat/);
    expect(header).toHaveTextContent(/1 sélectionnée/);
    expect(header).toHaveTextContent(/11 écartées/);
  });

  test('select-all names the count it will act on', async () => {
    renderWithProviders(
      <PhotoGrid
        params={params({ dateFrom: '2004-01-01', dateTo: '2004-12-31' })}
        selected={new Set()}
        onToggle={() => undefined}
        onSelectAll={() => undefined}
      />,
    );
    expect(await screen.findByRole('button', { name: /Sélectionner le 1 résultat/ })).toBeEnabled();
  });

  test('select-all hands back every id of the filter, not of the page', async () => {
    const user = userEvent.setup();
    const received: string[][] = [];
    renderWithProviders(
      <PhotoGrid
        params={params({ dateFrom: '2004-01-01', dateTo: '2004-12-31' })}
        selected={new Set()}
        onToggle={() => undefined}
        onSelectAll={(ids) => received.push(ids)}
      />,
    );
    await user.click(await screen.findByRole('button', { name: /Sélectionner/ }));
    expect(received[0]).toEqual(['8192a3b4c5d6e7f80911223344556677']);
  });
});

describe('INVARIANT §9.6.1 — a refused filter is an error, never an empty grid', () => {
  test('a 400 shows a named error and does NOT say zero results', async () => {
    server.use(
      http.get('*/photos', () =>
        HttpResponse.json(
          {
            error: {
              code: 'UNKNOWN_PARAMETER',
              message: 'Paramètre inconnu : colour',
              details: { parameters: ['colour'], accepted: [] },
            },
          },
          { status: 400 },
        ),
      ),
    );
    renderWithProviders(<PhotoGrid params={params()} selected={new Set()} onToggle={() => undefined} onSelectAll={() => undefined} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Paramètre inconnu : colour');
    expect(screen.queryByText(/0 résultat/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('selection-header')).not.toBeInTheDocument();
  });

  test('a genuinely empty result says so, and is not an error', async () => {
    renderWithProviders(
      <PhotoGrid
        params={params({ albumPath: '2099/nexiste-pas' })}
        selected={new Set()}
        onToggle={() => undefined}
        onSelectAll={() => undefined}
      />,
    );
    expect(await screen.findByTestId('selection-header')).toHaveTextContent(/0 résultat/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('a value that matched nothing is named, so the user knows why', async () => {
    renderWithProviders(
      <PhotoGrid
        params={params({ albumPath: '2099/nexiste-pas' })}
        selected={new Set()}
        onToggle={() => undefined}
        onSelectAll={() => undefined}
      />,
    );
    expect(await screen.findByTestId('unmatched-values')).toHaveTextContent('2099/nexiste-pas');
  });
});

describe('a contract breach is not confused with a server refusal', () => {
  test('a response outside the contract shows a drift error naming the field', async () => {
    server.use(
      http.get('*/photos', () =>
        HttpResponse.json({ items: [], total: 'beaucoup', populationTotal: 0, excludedCount: 0, filters: { applied: [], unmatchedValues: [] }, importId: 'x' }),
      ),
    );
    renderWithProviders(<PhotoGrid params={params()} selected={new Set()} onToggle={() => undefined} onSelectAll={() => undefined} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/contrat/i);
  });
});
