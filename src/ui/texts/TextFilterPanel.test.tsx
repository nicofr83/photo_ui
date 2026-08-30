import { render, screen } from '@testing-library/react';

import { renderWithProviders } from '../../test/renderWithProviders';
import { EMPTY_TEXT_FILTERS } from '../../domain/textFilterState';
import { TextSource } from '../../domain/textSource';

import { TextFilterPanel } from './TextFilterPanel';

const vide = EMPTY_TEXT_FILTERS;
const noop = (): void => undefined;

describe('v1.5, Task 10 — the Textes screen filters', () => {
  test('le sélecteur ne propose que ce que la source contient', async () => {
    renderWithProviders(
      <TextFilterPanel source={TextSource.MA_VIE} filters={vide} onChange={noop} />,
    );
    const annees = await screen.findAllByTestId(/^year-/);
    expect(annees.map((e) => e.textContent)).toEqual(['1999']);
  });

  test('les textes sans date écartés sont comptés, avec un geste pour les ramener', async () => {
    renderWithProviders(
      <TextFilterPanel
        source={TextSource.LOGBOOK}
        filters={{ ...vide, years: ['1999'] }}
        onChange={noop}
      />,
    );
    expect(await screen.findByTestId('excluded-count')).toHaveTextContent('341');
    expect(screen.getByRole('button', { name: /Inclure les textes sans date/ })).toBeInTheDocument();
  });

  test('sur le site non daté, le bloc de dates est désactivé et dit pourquoi', () => {
    // No network dependency for the web source (no single document to ask
    // facets of) — a plain render suffices, no provider/MSW round trip.
    render(<TextFilterPanel source={TextSource.WEB} filters={vide} onChange={noop} />);
    expect(screen.getByTestId('dates-disabled-reason'))
      .toHaveTextContent(/aucun texte du site n’est daté/i);
  });
});
