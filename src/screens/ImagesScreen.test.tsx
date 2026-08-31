import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';

import { renderWithProviders } from '../test/renderWithProviders';

import { ImagesScreen } from './ImagesScreen';

function setup(initialUrl = '/images/1999-transat') {
  return renderWithProviders(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/images/:slug" element={<ImagesScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('the screen composes filters, grid and selection', () => {
  test('the grid loads', async () => {
    setup();
    await waitFor(() => { expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(5); });
  });

  test('the filter panel is present', async () => {
    setup();
    expect(await screen.findByLabelText(/premier mois/i)).toBeInTheDocument();
  });
});

describe('INVARIANT §6.5 — a filter lives in the URL, so it cannot vanish quietly', () => {
  test('a filter arriving in the URL is applied and shown as a token', async () => {
    setup('/images/1999-transat?dateFrom=2004-01-01&dateTo=2004-12-31');
    expect(await screen.findByTestId('filter-token-dates')).toHaveTextContent('2004-01-01');
    const header = await screen.findByTestId('selection-header');
    expect(header).toHaveTextContent(/1 résultat/);
  });

  test('an unknown parameter in the URL is dropped rather than sent to the server', async () => {
    setup('/images/1999-transat?colour=grey');
    // If it were forwarded the server would answer 400 and we would see an alert.
    expect(await screen.findByTestId('selection-header')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('selection round-trips through the task', () => {
  test('the photo already held by the task starts checked', async () => {
    setup();
    const tile = await screen.findByLabelText(/Sélectionner scan-0007\.jpg/);
    expect(tile).toBeChecked();
  });

  test('selecting a photo persists it', async () => {
    const user = userEvent.setup();
    setup();
    const tile = await screen.findByLabelText(/Sélectionner PICT0042\.jpg/);
    await user.click(tile);
    await waitFor(() => {
      expect(screen.getByLabelText(/Sélectionner PICT0042\.jpg/)).toBeChecked();
    });
  });

  test('select-all acts on the filter and not on the page', async () => {
    const user = userEvent.setup();
    setup('/images/1999-transat?dateFrom=2004-01-01&dateTo=2004-12-31');
    await user.click(await screen.findByRole('button', { name: /Sélectionner le 1 résultat/ }));
    await waitFor(() => {
      expect(screen.getByLabelText(/Sélectionner DSCN2201\.jpg/)).toBeChecked();
    });
  });
});

describe('V1.7, Nicolas — un commentaire est demandé à la sélection, inline', () => {
  test('selecting a photo opens an inline field beneath the tile, focused', async () => {
    const user = userEvent.setup();
    setup();
    const tile = await screen.findByLabelText(/Sélectionner PICT0311\.jpg/);
    await user.click(tile);
    expect(await screen.findByRole('textbox', { name: /Commentaire pour PICT0311\.jpg/i })).toHaveFocus();
  });

  test('Enter saves the typed comment as the same note the Revue shows', async () => {
    const user = userEvent.setup();
    setup();
    const tile = await screen.findByLabelText(/Sélectionner PICT0311\.jpg/);
    await user.click(tile);
    const field = await screen.findByRole('textbox', { name: /Commentaire pour PICT0311\.jpg/i });
    await user.type(field, 'Hugo à la barre, on venait de doubler le Bugio{Enter}');
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: /Commentaire pour PICT0311\.jpg/i })).not.toBeInTheDocument();
    });

    // Démonter et remonter prouve que ça a atteint le serveur — même valeur
    // que la Revue lit, contrat §4.5 inchangé.
    const { unmount } = setup();
    unmount();
    const second = setup();
    await user.click(await second.findByRole('button', { name: /Agrandir PICT0311\.jpg/ }));
    expect(await second.findByLabelText('Commentaire')).toHaveValue(
      'Hugo à la barre, on venait de doubler le Bugio',
    );
  });

  test('Escape closes the field without writing anything — the photo stays selected', async () => {
    const user = userEvent.setup();
    setup();
    const tile = await screen.findByLabelText(/Sélectionner PICT0311\.jpg/);
    await user.click(tile);
    const field = await screen.findByRole('textbox', { name: /Commentaire pour PICT0311\.jpg/i });
    await user.type(field, 'brouillon jamais envoyé');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('textbox', { name: /Commentaire pour PICT0311\.jpg/i })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText(/Sélectionner PICT0311\.jpg/)).toBeChecked();
    });

    const { unmount } = setup();
    unmount();
    const second = setup();
    await user.click(await second.findByRole('button', { name: /Agrandir PICT0311\.jpg/ }));
    expect(await second.findByLabelText('Commentaire')).toHaveValue('');
  });

  // team-lead's ruling: a note surviving deselect→reselect is (a), server-
  // side, never a front-only cache (a cache lives in one tab; a reload would
  // silently discard the guarantee, and the front would become the keeper of
  // a human text the server itself erased — backwards, and a second source
  // of truth for the one thing this system has no other copy of). Was
  // LOCKED (`test.fails`) pending back's retention — landed (migration 008,
  // verified live on zz-repro-bug1: remove then re-add now keeps the note),
  // the mock updated to match (`mocks/handlers.ts`'s own retention map) —
  // unlocked, runs as an ordinary test now.
  test('deselecting then reselecting keeps an already-written comment', async () => {
    const user = userEvent.setup();
    setup();
    const tile = await screen.findByLabelText(/Sélectionner PICT0311\.jpg/);
    await user.click(tile);
    const field = await screen.findByRole('textbox', { name: /Commentaire pour PICT0311\.jpg/i });
    await user.type(field, 'Hugo à la barre{Enter}');
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: /Commentaire pour PICT0311\.jpg/i })).not.toBeInTheDocument();
    });

    // Deselect, then reselect the same photo.
    await user.click(screen.getByLabelText(/Sélectionner PICT0311\.jpg/));
    await waitFor(() => { expect(screen.getByLabelText(/Sélectionner PICT0311\.jpg/)).not.toBeChecked(); });
    await user.click(screen.getByLabelText(/Sélectionner PICT0311\.jpg/));

    // Team-lead's ruling: Escape never writes, never erases — on a
    // reselection it leaves the RESTORED comment intact, closing the field
    // and nothing else.
    const reopened = await screen.findByRole('textbox', { name: /Commentaire pour PICT0311\.jpg/i });
    expect(reopened).toHaveValue('Hugo à la barre');
    await user.keyboard('{Escape}');

    const { unmount } = setup();
    unmount();
    const second = setup();
    await user.click(await second.findByRole('button', { name: /Agrandir PICT0311\.jpg/ }));
    expect(await second.findByLabelText('Commentaire')).toHaveValue('Hugo à la barre');
  });
});

describe('V1.6, Nicolas — voir les images sélectionnées', () => {
  test('the toggle exists, off by default', async () => {
    setup();
    await screen.findByTestId('selection-header');
    expect(screen.getByRole('checkbox', { name: /voir les images sélectionnées/i })).not.toBeChecked();
  });

  test('turning it on shows only the task’s own images, bypassing /photos filters', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByLabelText(/Sélectionner scan-0007\.jpg/);
    const otherTile = screen.getByLabelText(/Sélectionner PICT0042\.jpg/);
    expect(otherTile).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /voir les images sélectionnées/i }));

    await waitFor(() => {
      expect(screen.queryByLabelText(/Sélectionner PICT0042\.jpg/)).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Sélectionner scan-0007\.jpg/)).toBeInTheDocument();
  });

  test('unchecking a tile in this view removes it from the task', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('checkbox', { name: /voir les images sélectionnées/i }));
    const tile = await screen.findByLabelText(/Sélectionner scan-0007\.jpg/);
    expect(tile).toBeChecked();

    await user.click(tile);

    await waitFor(() => {
      expect(screen.queryByLabelText(/Sélectionner scan-0007\.jpg/)).not.toBeInTheDocument();
    });
  });

  test('the toggle survives a reload — the URL is read on mount', async () => {
    setup('/images/1999-transat?selectedOnly=true');
    await screen.findByLabelText(/Sélectionner scan-0007\.jpg/);
    expect(screen.queryByLabelText(/Sélectionner PICT0042\.jpg/)).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /voir les images sélectionnées/i })).toBeChecked();
  });

  test('turning it off restores the normal filtered grid, and other filters still work', async () => {
    const user = userEvent.setup();
    setup('/images/1999-transat?selectedOnly=true');
    await screen.findByLabelText(/Sélectionner scan-0007\.jpg/);

    await user.click(screen.getByRole('checkbox', { name: /voir les images sélectionnées/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Sélectionner PICT0042\.jpg/)).toBeInTheDocument();
    });
  });

  test('changing another filter never clears the toggle', async () => {
    const user = userEvent.setup();
    setup('/images/1999-transat?selectedOnly=true');
    await screen.findByLabelText(/Sélectionner scan-0007\.jpg/);

    const sort = screen.getByLabelText(/trier par/i);
    await user.selectOptions(sort, 'date_desc');

    expect(screen.getByRole('checkbox', { name: /voir les images sélectionnées/i })).toBeChecked();
    expect(screen.queryByLabelText(/Sélectionner PICT0042\.jpg/)).not.toBeInTheDocument();
  });
});

describe('V1.6, Nicolas — clicking a thumbnail enlarges it', () => {
  test('opens the modal with the full-size render, and closing returns focus', async () => {
    const user = userEvent.setup();
    setup();
    const trigger = await screen.findByRole('button', { name: /Agrandir PICT0042\.jpg/ });
    await user.click(trigger);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', expect.stringContaining('/render'));

    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    await waitFor(() => { expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); });
    expect(trigger).toHaveFocus();
  });

  test('a selected image offers a comment field inside the modal', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: /Agrandir scan-0007\.jpg/ }));
    expect(await screen.findByLabelText('Commentaire')).toHaveValue('');
  });

  test('an image not (yet) selected offers no comment field — the note lives on the selection', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: /Agrandir PICT0042\.jpg/ }));
    await screen.findByRole('dialog');
    expect(screen.queryByLabelText('Commentaire')).not.toBeInTheDocument();
  });

  test('saving the comment persists it', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: /Agrandir scan-0007\.jpg/ }));
    const field = await screen.findByLabelText('Commentaire');
    await user.type(field, 'Hugo à la barre, on venait de doubler le Bugio');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    // Démonter et remonter prouve que ça a atteint le serveur.
    await waitFor(() => { expect(screen.getByRole('button', { name: /enregistrer/i })).toBeDisabled(); });
    const { unmount } = setup();
    unmount();
    const second = setup();
    await user.click(await second.findByRole('button', { name: /Agrandir scan-0007\.jpg/ }));
    expect(await second.findByLabelText('Commentaire')).toHaveValue(
      'Hugo à la barre, on venait de doubler le Bugio',
    );
  });
});

describe('the detail panel opens from the grid', () => {
  test('opening a photo shows its detail, and closing returns to the grid', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: /Détail de PICT0042\.jpg/ }));
    const panel = await screen.findByTestId('main-date');
    expect(within(panel).getByTestId('resolved-date')).toHaveTextContent('1999-10-14');
    await user.click(screen.getByRole('button', { name: /Fermer/ }));
    await waitFor(() => { expect(screen.queryByTestId('main-date')).not.toBeInTheDocument(); });
  });
});
