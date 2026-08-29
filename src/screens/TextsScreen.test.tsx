import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';

import { renderWithProviders } from '../test/renderWithProviders';

import { TextsScreen } from './TextsScreen';

const setup = (url = '/textes/1999-transat') =>
  renderWithProviders(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/textes/:slug" element={<TextsScreen />} />
      </Routes>
    </MemoryRouter>,
  );

describe('§5.3 — three sources, three sections, never mixed', () => {
  test('each source has its own section', async () => {
    setup();
    expect(await screen.findByRole('region', { name: /journal de bord/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /ma vie/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /site web/i })).toBeInTheDocument();
  });

  test('a logbook text never appears under Ma vie', async () => {
    setup();
    const maVie = await screen.findByRole('region', { name: /ma vie/i });
    expect(within(maVie).queryByText(/Porlamar/)).not.toBeInTheDocument();
  });

  test('the web section states it has no page rather than showing an empty frame', async () => {
    setup();
    const web = await screen.findByRole('region', { name: /site web/i });
    expect(within(web).getByTestId('no-pages')).toHaveTextContent(/pas de page/i);
  });
});

describe('INVARIANT — a text that asserts no date says so, and never guesses', () => {
  test('a passage placed only by its page shows "indéterminée"', async () => {
    setup();
    const card = await screen.findByTestId('text-passage-logbook/p003/001');
    expect(within(card).getByTestId('text-date')).toHaveTextContent(/indéterminée/i);
  });

  test('a dated entry shows its day, marked as a reading', async () => {
    setup();
    const card = await screen.findByTestId('text-log_entry-logbook/p003/001');
    const date = within(card).getByTestId('resolved-date');
    expect(date).toHaveTextContent('1999-12-08');
    expect(date).toHaveAttribute('data-date-kind', 'reading');
  });

  test('the two texts sharing an id are two distinct cards', async () => {
    setup();
    expect(await screen.findByTestId('text-passage-logbook/p003/001')).toBeInTheDocument();
    expect(screen.getByTestId('text-log_entry-logbook/p003/001')).toBeInTheDocument();
  });
});

describe('INVARIANT — a carried page window is an inference and must show as one', () => {
  test('a carried window is named as reported from the previous page', async () => {
    setup();
    const card = await screen.findByTestId('text-passage-ma-vie/p007/002');
    expect(within(card).getByTestId('span-source')).toHaveTextContent(/reportée/i);
  });

  test('an entries-derived window is not called carried', async () => {
    setup();
    const card = await screen.findByTestId('text-log_entry-logbook/p003/001');
    expect(within(card).getByTestId('span-source')).not.toHaveTextContent(/reportée/i);
  });
});

describe('§5.3 — each passage carries its transcription confidence', () => {
  test('an uncertain transcription is flagged', async () => {
    setup();
    const card = await screen.findByTestId('text-passage-logbook/p003/001');
    expect(within(card).getByTestId('confidence')).toHaveTextContent(/incertaine/i);
  });
});

describe('§5.4 — a correction never destroys the transcription', () => {
  test('a corrected text shows the original underneath', async () => {
    setup();
    const card = await screen.findByTestId('text-log_entry-logbook/p003/001');
    expect(within(card).getByTestId('text-original')).toHaveTextContent('noeuds');
    expect(within(card).getByTestId('text-effective')).toHaveTextContent('nœuds');
  });

  test('a correction whose upstream text moved is flagged "à revoir", not applied silently', async () => {
    setup();
    const card = await screen.findByTestId('text-passage-ma-vie/p007/003');
    expect(within(card).getByTestId('correction-status')).toHaveTextContent(/à revoir/i);
  });
});

describe('the overlap count is reachable', () => {
  test('a passage says how many photos it covers, as a control', async () => {
    const user = userEvent.setup();
    const opened: string[] = [];
    renderWithProviders(
      <MemoryRouter initialEntries={['/textes/1999-transat']}>
        <Routes>
          <Route
            path="/textes/:slug"
            element={<TextsScreen onShowPhotos={(ref) => opened.push(`${ref.kind}:${ref.id}`)} />}
          />
        </Routes>
      </MemoryRouter>,
    );
    const card = await screen.findByTestId('text-passage-logbook/p003/001');
    await user.click(within(card).getByRole('button', { name: /11 photos/ }));
    expect(opened).toEqual(['passage:logbook/p003/001']);
  });

  test('a passage covering nothing offers no button to press', async () => {
    setup();
    const card = await screen.findByTestId('text-passage-web/2003/2003_gal_1/001');
    expect(within(card).queryByRole('button', { name: /photos/ })).not.toBeInTheDocument();
  });
});
