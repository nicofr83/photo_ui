import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { TextPage } from '../../api/contract/text';
import { PageSpanSource } from '../../shared/enums';

import { PageViewer } from './PageViewer';

const page: TextPage = {
  id: 'logbook/p003', documentId: 'logbook', ordinal: 3, label: 'p003',
  width: 810, height: 1250,
  window: null, date: null, matchCount: null, spanSource: PageSpanSource.ENTRIES,
  imageUrl: '/pages/image?pageId=logbook/p003',
  regionsAvailable: false,
};

describe('spec §5.4 — facing page: 810×1250 handwriting needs zoom and pan', () => {
  test('shows the scanned page', async () => {
    render(<PageViewer page={page} />);
    const img = await screen.findByRole('img');
    expect(img).toHaveAttribute('src', '/pages/image?pageId=logbook/p003');
    expect(img).toHaveAccessibleName(/p003/);
  });

  test('INVARIANT — never a highlight overlay: pages.region is NULL on every row', () => {
    render(<PageViewer page={page} />);
    expect(screen.queryByTestId(/region/)).not.toBeInTheDocument();
  });

  test('zooming in increases the scale', async () => {
    const user = userEvent.setup();
    render(<PageViewer page={page} />);
    const before = screen.getByTestId('page-surface').dataset['scale'];
    await user.click(screen.getByRole('button', { name: /zoom avant/i }));
    expect(Number(screen.getByTestId('page-surface').dataset['scale']))
      .toBeGreaterThan(Number(before));
  });

  test('zooming out is clamped — it never shrinks the page away', async () => {
    const user = userEvent.setup();
    render(<PageViewer page={page} />);
    const button = screen.getByRole('button', { name: /zoom arrière/i });
    for (let i = 0; i < 20; i += 1) await user.click(button);
    expect(Number(screen.getByTestId('page-surface').dataset['scale'])).toBeGreaterThanOrEqual(1);
  });

  test('reset restores scale to 1 and pan to the origin', async () => {
    const user = userEvent.setup();
    render(<PageViewer page={page} />);
    await user.click(screen.getByRole('button', { name: /zoom avant/i }));
    await user.click(screen.getByRole('button', { name: /zoom avant/i }));
    await user.click(screen.getByRole('button', { name: /réinitialiser/i }));
    const surface = screen.getByTestId('page-surface');
    expect(surface.dataset['scale']).toBe('1');
    expect(surface.dataset['panX']).toBe('0');
    expect(surface.dataset['panY']).toBe('0');
  });

  test('dragging pans the image', () => {
    render(<PageViewer page={page} />);
    const surface = screen.getByTestId('page-surface');
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 140, clientY: 130, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 140, clientY: 130, pointerId: 1 });
    expect(surface.dataset['panX']).toBe('40');
    expect(surface.dataset['panY']).toBe('30');
  });

  test('panning stops once the pointer is released', () => {
    render(<PageViewer page={page} />);
    const surface = screen.getByTestId('page-surface');
    fireEvent.pointerDown(surface, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 999, clientY: 999, pointerId: 1 });
    expect(surface.dataset['panX']).toBe('10');
    expect(surface.dataset['panY']).toBe('10');
  });

  test('a page with no label still names itself by ordinal', async () => {
    render(<PageViewer page={{ ...page, label: null }} />);
    const img = await screen.findByRole('img');
    expect(img).toHaveAccessibleName(/3/);
  });
});
