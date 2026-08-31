import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { INVARIANT_PHOTOS, MISSING_THUMB_SHA256 } from '../../../fixtures/invariants/photos';

import { PhotoTile } from './PhotoTile';

const byFile = (name: string) => {
  const photo = INVARIANT_PHOTOS.find((p) => p.fileName === name);
  if (photo === undefined) throw new Error(`fixture not found: ${name}`);
  return photo;
};

const noop = () => undefined;

describe('the date is rendered by the one component allowed to render dates', () => {
  test('a reading shows its day, marked as a reading', () => {
    render(<PhotoTile photo={byFile('PICT0042.jpg')} selected={false} onToggle={noop} />);
    const date = screen.getByTestId('resolved-date');
    expect(date).toHaveAttribute('data-date-kind', 'reading');
    expect(date).toHaveTextContent('1999-10-14');
  });

  test('INVARIANT §9.6.4 — a month-precision photo shows a month, never a day', () => {
    render(<PhotoTile photo={byFile('PICT0311.jpg')} selected={false} onToggle={noop} />);
    const date = screen.getByTestId('resolved-date');
    expect(date).toHaveTextContent('décembre 2000');
    expect(date.textContent).not.toContain('2000-12-01');
  });

  test('INVARIANT §7.4 — an undated photo says "sans date"', () => {
    render(<PhotoTile photo={byFile('sans-vignette.jpg')} selected={false} onToggle={noop} />);
    expect(screen.getByTestId('resolved-date')).toHaveTextContent('sans date');
  });
});

describe('selection is visible without hovering', () => {
  test('the checkbox is in the accessibility tree at all times', () => {
    render(<PhotoTile photo={byFile('PICT0042.jpg')} selected={false} onToggle={noop} />);
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  test('a selected tile reports itself as checked', () => {
    render(<PhotoTile photo={byFile('PICT0042.jpg')} selected onToggle={noop} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  test('the checkbox names the photo so it is not "checkbox, checkbox, checkbox"', () => {
    render(<PhotoTile photo={byFile('PICT0042.jpg')} selected={false} onToggle={noop} />);
    expect(screen.getByRole('checkbox')).toHaveAccessibleName(/PICT0042\.jpg/);
  });

  test('clicking reports the photo and whether shift was held', async () => {
    const user = userEvent.setup();
    const calls: { id: string; shift: boolean }[] = [];
    render(
      <PhotoTile
        photo={byFile('PICT0042.jpg')}
        selected={false}
        onToggle={(id, shift) => calls.push({ id, shift })}
      />,
    );
    await user.click(screen.getByRole('checkbox'));
    expect(calls).toEqual([{ id: '05b9a4fac5df4dd28dcc1002d7ec0074', shift: false }]);
  });

  test('shift-clicking reports the range intent', async () => {
    const user = userEvent.setup();
    const calls: { id: string; shift: boolean }[] = [];
    render(
      <PhotoTile
        photo={byFile('PICT0042.jpg')}
        selected={false}
        onToggle={(id, shift) => calls.push({ id, shift })}
      />,
    );
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('checkbox'));
    await user.keyboard('{/Shift}');
    expect(calls[0]?.shift).toBe(true);
  });
});

describe('§5.2 — a missing thumbnail is a named grey tile, never a void', () => {
  // alt="" on purpose: the figcaption already carries the file name and the
  // date, and no caption exists to describe the picture in V1. Repeating the
  // file name as alt text would only make a screen reader say it twice.
  test('the image is decorative, lazy, and keyed on the content hash', () => {
    render(<PhotoTile photo={byFile('PICT0042.jpg')} selected={false} onToggle={noop} />);
    const img = screen.getByTestId('thumb');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('src', expect.stringContaining(byFile('PICT0042.jpg').sha256));
  });

  test('when the file is missing the tile names the file instead of showing a void', () => {
    const missing = INVARIANT_PHOTOS.find((p) => p.sha256 === MISSING_THUMB_SHA256);
    if (missing === undefined) throw new Error('missing-thumb fixture absent');
    render(<PhotoTile photo={missing} selected={false} onToggle={noop} />);
    fireEvent.error(screen.getByTestId('thumb'));
    expect(screen.getByTestId('thumb-unavailable')).toHaveTextContent('sans-vignette.jpg');
  });
});

describe('§5.2 — held by another task is information, not prohibition', () => {
  test('a photo already in a task is marked', () => {
    render(<PhotoTile photo={byFile('scan-0007.jpg')} selected={false} onToggle={noop} />);
    expect(screen.getByTestId('in-other-task')).toHaveAccessibleName(/1999-transat/);
  });

  test('and it stays selectable', () => {
    render(<PhotoTile photo={byFile('scan-0007.jpg')} selected={false} onToggle={noop} />);
    expect(screen.getByRole('checkbox')).toBeEnabled();
  });

  test('a photo held by no other task carries no marker', () => {
    render(<PhotoTile photo={byFile('PICT0042.jpg')} selected={false} onToggle={noop} />);
    expect(screen.queryByTestId('in-other-task')).not.toBeInTheDocument();
  });
});

describe('V1.7, Nicolas — selecting a photo asks for a comment, inline', () => {
  test('clicking to select opens an inline comment field, already focused', async () => {
    const user = userEvent.setup();
    render(<PhotoTile photo={byFile('PICT0042.jpg')} selected={false} onToggle={noop} onComment={noop} />);
    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('textbox', { name: /commentaire/i })).toHaveFocus();
  });

  test('an already-selected photo shows no field on mount — never a reopened editor', () => {
    render(<PhotoTile photo={byFile('PICT0042.jpg')} selected onToggle={noop} onComment={noop} />);
    expect(screen.queryByRole('textbox', { name: /commentaire/i })).not.toBeInTheDocument();
  });

  test('unchecking an already-selected photo does not open the field', async () => {
    const user = userEvent.setup();
    render(<PhotoTile photo={byFile('PICT0042.jpg')} selected onToggle={noop} onComment={noop} />);
    await user.click(screen.getByRole('checkbox'));
    expect(screen.queryByRole('textbox', { name: /commentaire/i })).not.toBeInTheDocument();
  });

  test('typing a comment and pressing Enter saves it and closes the field', async () => {
    const user = userEvent.setup();
    const calls: { id: string; note: string }[] = [];
    render(
      <PhotoTile
        photo={byFile('PICT0042.jpg')}
        selected={false}
        onToggle={noop}
        onComment={(id, note) => { calls.push({ id, note }); }}
      />,
    );
    await user.click(screen.getByRole('checkbox'));
    await user.type(screen.getByRole('textbox', { name: /commentaire/i }), 'Hugo à la barre{Enter}');
    expect(calls).toEqual([{ id: '05b9a4fac5df4dd28dcc1002d7ec0074', note: 'Hugo à la barre' }]);
    expect(screen.queryByRole('textbox', { name: /commentaire/i })).not.toBeInTheDocument();
  });

  test('Escape closes the field without saving — the photo stays selected without a comment', async () => {
    const user = userEvent.setup();
    const calls: unknown[] = [];
    render(
      <PhotoTile
        photo={byFile('PICT0042.jpg')}
        selected={false}
        onToggle={noop}
        onComment={(...args: unknown[]) => { calls.push(args); }}
      />,
    );
    await user.click(screen.getByRole('checkbox'));
    await user.type(screen.getByRole('textbox', { name: /commentaire/i }), 'brouillon');
    await user.keyboard('{Escape}');
    expect(calls).toEqual([]);
    expect(screen.queryByRole('textbox', { name: /commentaire/i })).not.toBeInTheDocument();
  });

  test('pressing Enter with an empty draft writes nothing, just closes', async () => {
    const user = userEvent.setup();
    const calls: unknown[] = [];
    render(
      <PhotoTile
        photo={byFile('PICT0042.jpg')}
        selected={false}
        onToggle={noop}
        onComment={(...args: unknown[]) => { calls.push(args); }}
      />,
    );
    await user.click(screen.getByRole('checkbox'));
    await user.keyboard('{Enter}');
    expect(calls).toEqual([]);
    expect(screen.queryByRole('textbox', { name: /commentaire/i })).not.toBeInTheDocument();
  });

  test('without onComment, selecting never opens a field — opt-in, like onEnlarge/onOpen', async () => {
    const user = userEvent.setup();
    render(<PhotoTile photo={byFile('PICT0042.jpg')} selected={false} onToggle={noop} />);
    await user.click(screen.getByRole('checkbox'));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

describe('V1.6, Nicolas — clicking the thumbnail enlarges it, same as the Revue', () => {
  test('without onEnlarge, the thumbnail is a plain image, not a button', () => {
    render(<PhotoTile photo={byFile('PICT0042.jpg')} selected={false} onToggle={noop} />);
    expect(screen.queryByRole('button', { name: /agrandir/i })).not.toBeInTheDocument();
  });

  test('with onEnlarge, clicking the thumbnail reports the whole photo, not the checkbox', async () => {
    const user = userEvent.setup();
    const enlarged: string[] = [];
    render(
      <PhotoTile
        photo={byFile('PICT0042.jpg')}
        selected={false}
        onToggle={noop}
        onEnlarge={(photo) => enlarged.push(photo.cloudAssetId)}
      />,
    );
    await user.click(screen.getByRole('button', { name: /agrandir/i }));
    expect(enlarged).toEqual(['05b9a4fac5df4dd28dcc1002d7ec0074']);
    // The checkbox is untouched — enlarging is not selecting.
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
});
