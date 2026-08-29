import { screen } from '@testing-library/react';

import { renderWithProviders } from '../../test/renderWithProviders';

import { PhotoDetail } from './PhotoDetail';

const open = (id: string) =>
  renderWithProviders(<PhotoDetail cloudAssetId={id} onClose={() => undefined} />);

const EXIF_PHOTO = '05b9a4fac5df4dd28dcc1002d7ec0074';
const PROPOSAL_PHOTO = '2b3c4d5e6f708192a3b4c5d6e7f80911';
const NO_BRACKET_PHOTO = '3c4d5e6f708192a3b4c5d6e7f8091122';
const UNDATED_PHOTO = '708192a3b4c5d6e7f809112233445566';
const SCAN_PHOTO = '5e6f708192a3b4c5d6e7f80911223344';

describe('the date is shown with its nature AND its detail', () => {
  test('an arbitrated EXIF states the measured gap to the album', async () => {
    open(SCAN_PHOTO);
    expect(await screen.findByTestId('main-date')).toHaveTextContent(/EXIF écarté, à 190 mois/);
  });

  test('a reading is marked as a reading', async () => {
    open(EXIF_PHOTO);
    const date = (await screen.findByTestId('main-date')).firstElementChild;
    expect(date).toHaveAttribute('data-date-kind', 'reading');
  });
});

describe('INVARIANT §9.2 — proposal and doubt are separate blocks, never folded into the date', () => {
  test('a rank-3 photo shows a proposal block distinct from its date', async () => {
    open(PROPOSAL_PHOTO);
    expect(await screen.findByTestId('proposal-block')).toBeInTheDocument();
    expect(screen.queryByTestId('doubt-block')).not.toBeInTheDocument();
  });

  test('the evidence is reachable, not merely mentioned', async () => {
    open(PROPOSAL_PHOTO);
    const links = await screen.findAllByTestId(/^evidence-/);
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', expect.stringContaining('logbook/1999-12-07'));
  });

  test('an undated photo shows the DOUBT, with its reason', async () => {
    open(UNDATED_PHOTO);
    const doubt = await screen.findByTestId('doubt-block');
    expect(doubt).toHaveTextContent(/ne nomme aucun lieu/);
    expect(screen.queryByTestId('proposal-block')).not.toBeInTheDocument();
  });

  test('a photo with neither shows neither block', async () => {
    open(EXIF_PHOTO);
    await screen.findByTestId('main-date');
    expect(screen.queryByTestId('proposal-block')).not.toBeInTheDocument();
    expect(screen.queryByTestId('doubt-block')).not.toBeInTheDocument();
  });
});

describe('INVARIANT §7.1 — a proposal without a bracket says so, never a number', () => {
  test('"sans fourchette" is displayed', async () => {
    open(NO_BRACKET_PHOTO);
    expect(await screen.findByTestId('main-date')).toHaveTextContent('sans fourchette');
  });

  test('a proposal WITH a bracket shows it', async () => {
    open(PROPOSAL_PHOTO);
    expect(await screen.findByTestId('main-date')).toHaveTextContent('± 96 h');
  });
});

describe('INVARIANT §7.4 — absent is not zero', () => {
  test('a photo with no position says "sans position"', async () => {
    open(EXIF_PHOTO);
    expect(await screen.findByTestId('position')).toHaveTextContent('sans position');
  });

  test('an interpolated position is marked as an inference, not as a fix', async () => {
    open(PROPOSAL_PHOTO);
    expect(await screen.findByTestId('position')).toHaveTextContent(/interpolée|inférée/i);
  });
});

describe('§5.2 — the three render failures are never confused', () => {
  test('a renderable photo shows the render', async () => {
    open(EXIF_PHOTO);
    expect(await screen.findByTestId('render')).toBeInTheDocument();
  });

  test('a missing source file names THIS photo, not the configuration', async () => {
    open(UNDATED_PHOTO);
    const message = await screen.findByTestId('render-unavailable');
    expect(message).toHaveTextContent(/fichier/i);
    expect(message.textContent).not.toMatch(/volume/i);
    expect(screen.queryByTestId('render')).not.toBeInTheDocument();
  });
});

describe('§6.3 — tags are shown with their confidence, and a tag without one is not dropped', () => {
  test('a tag with no confidence is still listed', async () => {
    open(EXIF_PHOTO);
    expect(await screen.findByTestId('tag-famille')).toBeInTheDocument();
  });

  test('a confidence is displayed when present', async () => {
    open(EXIF_PHOTO);
    expect(await screen.findByTestId('tag-boat')).toHaveTextContent('71');
  });
});

describe('album membership is multiple', () => {
  test('every album is listed, not just the principal one', async () => {
    open(EXIF_PHOTO);
    expect(await screen.findByTestId('albums')).toHaveTextContent('all pics');
  });
});
