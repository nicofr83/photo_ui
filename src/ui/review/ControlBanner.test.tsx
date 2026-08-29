import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { TaskReviewWarnings } from '../../api/contract/review';

import { ControlBanner } from './ControlBanner';

const WARNINGS: TaskReviewWarnings = {
  undatedImages: 2, inferredDateImages: 1, uncertainTexts: 0, textsWiderThan30Days: 0,
  imagesWithoutText: 5, orphanedImages: 0, orphanedTexts: 0, imagesOutOfPeriod: 3,
};

const setup = () => render(<ControlBanner warnings={WARNINGS} />);

describe('spec §5.6 — the control banner, non-blocking, eight counters', () => {
  test('all eight counters render', () => {
    setup();
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(8);
  });

  test('a zero count is shown, not hidden — "rien n\'est écarté en silence"', () => {
    setup();
    expect(screen.getByRole('button', { name: /textes incertains/i })).toHaveTextContent('0');
  });

  test("each count is clickable, spec's own words", async () => {
    const user = userEvent.setup();
    setup();
    const button = screen.getByRole('button', { name: /photos sans date/i });
    await user.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  test('clicking shows a plain explanation of what the count means', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: /photos sans texte/i }));
    expect(screen.getByTestId('warning-explanation')).toHaveTextContent(/aucun texte/i);
  });

  test('clicking again clears it', async () => {
    const user = userEvent.setup();
    setup();
    const button = screen.getByRole('button', { name: /photos sans date/i });
    await user.click(button);
    await user.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('warning-explanation')).not.toBeInTheDocument();
  });
});
