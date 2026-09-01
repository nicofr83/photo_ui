import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { server } from '../../../mocks/node';
import type { TextPage } from '../../api/contract/text';
import { DateKind, DatePrecision, DateSource } from '../../shared/enums';
import { parseIsoDate } from '../../shared/date_interface';
import { renderWithProviders } from '../../test/renderWithProviders';

import { PageProse } from './PageProse';

const SLUG = '1999-transat';

const page: TextPage = {
  id: 'ma-vie/p007', documentId: 'ma-vie', ordinal: 7, label: 'p007',
  width: 810, height: 1250, window: null,
  date: {
    start: parseIsoDate('1999-09-23'), end: parseIsoDate('1999-09-23'), precision: DatePrecision.DAY,
    kind: DateKind.READING, source: DateSource.PAGE_DATE, bracketHours: null,
  },
  matchCount: null, spanSource: null,
  imageUrl: '/pages/image?pageId=ma-vie%2Fp007', regionsAvailable: false,
};

const setup = () => renderWithProviders(
  <PageProse page={page} slug={SLUG} noteTitle="ma vie, page 7 du 23/09/1999" />,
);

// jsdom has no real Selection/Range rendering — this simulates what a
// mouse drag produces: an actual Range over a text node, then the same
// `selectionchange` event a real browser fires.
function selectWithin(text: string): void {
  const target = [...document.querySelectorAll('p')].find((p) => p.textContent === text);
  if (target === undefined) throw new Error(`sentence not found: ${text}`);
  const textNode = target.firstChild;
  if (textNode === null) throw new Error('empty paragraph');
  const range = document.createRange();
  range.selectNodeContents(textNode);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  act(() => { document.dispatchEvent(new Event('selectionchange')); });
}

describe('V1.7 — la prose libre d’une page, une phrase par ligne (partagée journal / Ma vie)', () => {
  test('the page\'s passages render together, in order, split into sentences', async () => {
    setup();
    expect(await screen.findByText('La transat commence vraiment ce matin.')).toBeInTheDocument();
    expect(screen.getByText('Gaëtan prend le quart de nuit.')).toBeInTheDocument();
  });

  test('no selection, no button', async () => {
    setup();
    await screen.findByText('La transat commence vraiment ce matin.');
    expect(screen.queryByRole('button', { name: 'Créer une note' })).not.toBeInTheDocument();
  });

  test('a non-empty selection surfaces « Créer une note »', async () => {
    setup();
    await screen.findByText('La transat commence vraiment ce matin.');
    selectWithin('La transat commence vraiment ce matin.');
    expect(await screen.findByRole('button', { name: 'Créer une note' })).toBeInTheDocument();
  });

  test('clicking it opens the shared editor, prefilled with the selection', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText('La transat commence vraiment ce matin.');
    selectWithin('La transat commence vraiment ce matin.');
    await user.click(await screen.findByRole('button', { name: 'Créer une note' }));
    expect(screen.getByRole('textbox')).toHaveValue('La transat commence vraiment ce matin.');
  });

  test('creating derives from the PAGE, never a single passage — a selection can span two', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText('La transat commence vraiment ce matin.');
    selectWithin('La transat commence vraiment ce matin.');
    await user.click(await screen.findByRole('button', { name: 'Créer une note' }));
    await user.click(screen.getByRole('button', { name: 'Créer la note' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Créer une note' })).not.toBeInTheDocument();
    });
  });

  test('uses the title the caller built — no title logic of its own', async () => {
    const user = userEvent.setup();
    let notesBody: unknown = null;
    server.use(http.post(`*/tasks/${SLUG}/notes`, async ({ request }) => {
      notesBody = await request.json();
      return HttpResponse.json({
        id: 'note-x', title: 'x', text: 'x', createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z', attachedTo: { images: [], texts: [] },
        derivedFrom: null, editedSince: false, quotable: false,
      });
    }));

    setup();
    await screen.findByText('La transat commence vraiment ce matin.');
    selectWithin('La transat commence vraiment ce matin.');
    await user.click(await screen.findByRole('button', { name: 'Créer une note' }));
    await user.click(screen.getByRole('button', { name: 'Créer la note' }));

    await waitFor(() => { expect(notesBody).not.toBeNull(); });
    expect((notesBody as { title: string }).title).toBe('ma vie, page 7 du 23/09/1999');
  });
});
