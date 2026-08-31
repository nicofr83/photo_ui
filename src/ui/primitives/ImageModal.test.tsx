import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ImageModal } from './ImageModal';

describe('V1.6, Nicolas #3 — the enlarged image, in a modal', () => {
  test('shows the image', () => {
    render(<ImageModal src="/images/x/render" alt="scan.jpg" onClose={() => {}} />);
    expect(screen.getByRole('img', { name: 'scan.jpg' })).toHaveAttribute('src', '/images/x/render');
  });

  test('focus moves to the close button on open', () => {
    render(<ImageModal src="/x" alt="scan.jpg" onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus();
  });

  test('the close button closes it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ImageModal src="/x" alt="scan.jpg" onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Escape closes it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ImageModal src="/x" alt="scan.jpg" onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('a click outside the image (the backdrop) closes it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ImageModal src="/x" alt="scan.jpg" onClose={onClose} />);
    await user.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    // The dialog element itself is the padded area around the image, not
    // the image — a real click there is a click "outside" it.
    const dialog = screen.getByRole('dialog').parentElement;
    if (dialog === null) throw new Error('backdrop not found');
    await user.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('a click ON the image never closes it — enlarging it to look closer would be self-defeating', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ImageModal src="/x" alt="scan.jpg" onClose={onClose} />);
    await user.click(screen.getByRole('img', { name: 'scan.jpg' }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
