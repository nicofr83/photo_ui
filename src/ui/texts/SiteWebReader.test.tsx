import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '../../test/renderWithProviders';

import { SiteWebReader } from './SiteWebReader';

const SLUG = '1999-transat';
const setup = () => renderWithProviders(<SiteWebReader slug={SLUG} />);

describe('V1.7 — le site web, cinq pages, sans filtre', () => {
  test('lists the 5 real pages by their own title, no filter offered', async () => {
    setup();
    expect(await screen.findByRole('button', { name: '1998-1999' })).toBeInTheDocument();
    // 1900-1988.htm's own <title> diverges from its filename — the LIST
    // shows the title, not the filename.
    expect(screen.getByRole('button', { name: '1958-1998' })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  test('clicking a page opens it in a sandboxed iframe, without allow-scripts', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: '1998-1999' }));

    const frame = document.querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(frame).toHaveAttribute('sandbox', 'allow-same-origin');
    expect(frame).toHaveAttribute('src', '/texts/web/page?id=1998-1999.htm');
    expect(frame).toHaveAttribute('title', '1998-1999');
  });

  test('« ← Retour aux pages » returns to the list', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: '1998-1999' }));
    await user.click(screen.getByRole('button', { name: /retour aux pages/i }));
    expect(await screen.findByRole('button', { name: '1998-1999' })).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
  });
});

describe('V1.7 — sélectionner du texte dans la page et en faire une note', () => {
  test('a selection inside the frame surfaces « Créer une note », and creating derives from the document', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: '1998-1999' }));
    const frame = document.querySelector('iframe') as HTMLIFrameElement;

    // jsdom does not navigate an iframe's `src` over the network the way a
    // real browser does — write directly into its (same-origin) document
    // and fire the same `load` event the real one would.
    const doc = frame.contentDocument;
    if (doc === null) throw new Error('iframe has no contentDocument in jsdom');
    doc.open();
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- only way jsdom gives an about:blank iframe a real documentElement/body.
    doc.write('<p id="target">Un extrait daté du site en 1998.</p>');
    doc.close();
    act(() => { frame.dispatchEvent(new Event('load')); });

    const target = doc.getElementById('target');
    if (target?.firstChild == null) throw new Error('fixture paragraph missing');
    const range = doc.createRange();
    range.selectNodeContents(target.firstChild);
    const selection = doc.defaultView?.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    act(() => { doc.dispatchEvent(new Event('selectionchange')); });

    await user.click(await screen.findByRole('button', { name: 'Créer une note' }));
    expect(screen.getByRole('textbox')).toHaveValue('Un extrait daté du site en 1998.');

    await user.click(screen.getByRole('button', { name: 'Créer la note' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Créer une note' })).not.toBeInTheDocument();
    });
  });
});
