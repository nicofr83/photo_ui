import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '../test/renderWithProviders';

import { SettingsScreen } from './SettingsScreen';

const setup = () => renderWithProviders(<SettingsScreen />);

describe('spec §5.7/contract §4.8 — Réglages, the highest-yield screen', () => {
  test('albums are listed alphabetically by path, never by suspected status or a date sort', async () => {
    setup();
    const list = await screen.findByRole('list', { name: /albums/i });
    const rows = within(list).getAllByRole('listitem');
    const paths = rows.map((r) => r.dataset['testid']);
    // The AAAA-MM prefix already gives chronological order for free — this
    // is a plain string sort on `path`, nothing date-aware.
    expect(paths).toEqual([
      'album-row-1998-1999/1998-02-Maison rose Algès',
      'album-row-1998-1999/1999-10 Lisboa Madere',
      'album-row-2000-2001/2000',
      'album-row-2000-2001/2000-12-viree au Venezuela-3mois',
      'album-row-2004/2004-03- visite de Tikal',
    ]);
  });

  test('the search field narrows the list to a substring, anywhere in the path', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('list', { name: /albums/i });
    await user.type(screen.getByLabelText(/rechercher un album/i), 'Venezuela');
    const list = screen.getByRole('list', { name: /albums/i });
    await waitFor(() => {
      expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    });
    expect(screen.getByTestId('album-row-2000-2001/2000-12-viree au Venezuela-3mois'))
      .toBeInTheDocument();
  });

  test('the search field is accent- and case-insensitive', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('list', { name: /albums/i });
    await user.type(screen.getByLabelText(/rechercher un album/i), 'alges');
    await waitFor(() => {
      expect(screen.getByTestId('album-row-1998-1999/1998-02-Maison rose Algès'))
        .toBeInTheDocument();
      expect(screen.queryByTestId('album-row-2000-2001/2000-12-viree au Venezuela-3mois'))
        .not.toBeInTheDocument();
    });
  });

  test('an already-typed span is shown as such, distinct from a presumed one', async () => {
    setup();
    const row = await screen.findByTestId('album-row-1998-1999/1998-02-Maison rose Algès');
    expect(row).toHaveTextContent(/saisi/i);
  });

  test('a presumed span says so', async () => {
    setup();
    const row = await screen.findByTestId('album-row-1998-1999/1999-10 Lisboa Madere');
    expect(row).toHaveTextContent(/présumé/i);
  });

  test('the file-name-pattern hint is shown as an aid, never pre-filled', async () => {
    setup();
    const row = await screen.findByTestId('album-row-1998-1999/1998-02-Maison rose Algès');
    expect(within(row).getByTestId('hint-file-patterns')).toHaveTextContent('98-99');
    expect(within(row).getByLabelText(/premier jour/i)).toHaveValue('');
  });

  test('the rejected-EXIF hint names its count', async () => {
    setup();
    const row = await screen.findByTestId('album-row-1998-1999/1998-02-Maison rose Algès');
    expect(within(row).getByTestId('hint-rejected-exif')).toHaveTextContent('19');
  });

  test('saving a valid span reports what it recomputed', async () => {
    const user = userEvent.setup();
    setup();
    const row = await screen.findByTestId('album-row-1998-1999/1999-10 Lisboa Madere');
    await user.type(within(row).getByLabelText(/premier jour/i), '1999-10-05');
    await user.type(within(row).getByLabelText(/dernier jour/i), '1999-10-20');
    await user.click(within(row).getByRole('button', { name: /enregistrer/i }));

    expect(await within(row).findByTestId('recompute-report')).toHaveTextContent(/photo/i);
  });

  test('dateTo before dateFrom is refused, shown as an error', async () => {
    const user = userEvent.setup();
    setup();
    const row = await screen.findByTestId('album-row-1998-1999/1999-10 Lisboa Madere');
    await user.type(within(row).getByLabelText(/premier jour/i), '1999-10-20');
    await user.type(within(row).getByLabelText(/dernier jour/i), '1999-10-05');
    await user.click(within(row).getByRole('button', { name: /enregistrer/i }));

    expect(await within(row).findByRole('alert')).toBeInTheDocument();
  });

  test('a warning is shown as accepted-with-a-caveat, not a refusal', async () => {
    const user = userEvent.setup();
    setup();
    const row = await screen.findByTestId('album-row-1998-1999/1999-10 Lisboa Madere');
    await user.type(within(row).getByLabelText(/premier jour/i), '1995-01-01');
    await user.type(within(row).getByLabelText(/dernier jour/i), '1995-01-31');
    await user.click(within(row).getByRole('button', { name: /enregistrer/i }));

    expect(await within(row).findByTestId('span-warning')).toHaveTextContent(/préfixe/i);
    expect(within(row).queryByRole('alert')).not.toBeInTheDocument();
  });

  test('an already-typed span can be cleared, back to presumed', async () => {
    const user = userEvent.setup();
    setup();
    const row = await screen.findByTestId('album-row-1998-1999/1998-02-Maison rose Algès');
    await user.click(within(row).getByRole('button', { name: /effacer/i }));
    await waitFor(() => { expect(row).toHaveTextContent(/présumé/i); });
  });

  test('a span not yet typed offers no "effacer" — there is nothing to revert', async () => {
    setup();
    const row = await screen.findByTestId('album-row-1998-1999/1999-10 Lisboa Madere');
    expect(within(row).queryByRole('button', { name: /effacer/i })).not.toBeInTheDocument();
  });
});

describe('contract §4.8 — web documents, where the path is the only date hint', () => {
  test('a document is listed with its path named as the hint it is', async () => {
    setup();
    const row = await screen.findByTestId('web-doc-web/2003/2003_gal_1');
    expect(within(row).getByTestId('path-hint')).toHaveTextContent('web/2003/2003_gal_1');
  });

  test('saving a span marks it as an inference, not a certainty', async () => {
    const user = userEvent.setup();
    setup();
    const row = await screen.findByTestId('web-doc-web/2003/2003_gal_1');
    await user.type(within(row).getByLabelText(/premier jour/i), '2003-01-01');
    await user.type(within(row).getByLabelText(/dernier jour/i), '2003-12-31');
    await user.click(within(row).getByRole('button', { name: /enregistrer/i }));

    const date = await within(row).findByTestId('resolved-date');
    expect(date).toHaveAttribute('data-date-kind', 'inference');
  });
});
