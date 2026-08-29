import { render, screen } from '@testing-library/react';

import type { TaskReviewTimelineEntry } from '../../api/contract/review';
import { parseIsoDate } from '../../shared/date_interface';

import { Chronology } from './Chronology';

const entry = (
  id: string, kind: 'image' | 'text', start: string, end: string,
): TaskReviewTimelineEntry => ({
  id, kind, start: parseIsoDate(start), end: parseIsoDate(end), precision: 'day', dateKind: 'reading',
});

describe('spec §5.6 — images and texts on one axis', () => {
  test('an empty timeline says so, rather than an empty silence', () => {
    render(<Chronology timeline={[]} />);
    expect(screen.getByText(/rien à placer/i)).toBeInTheDocument();
  });

  test('every entry renders, positioned', () => {
    render(<Chronology timeline={[
      entry('img-1', 'image', '1999-01-01', '1999-01-01'),
      entry('text-1', 'text', '1999-06-01', '1999-06-10'),
    ]} />);
    expect(screen.getByTestId('chronology-img-1')).toBeInTheDocument();
    expect(screen.getByTestId('chronology-text-1')).toBeInTheDocument();
  });

  test('image and text entries carry their kind, for shape/lane', () => {
    render(<Chronology timeline={[entry('img-1', 'image', '1999-01-01', '1999-01-01')]} />);
    expect(screen.getByTestId('chronology-img-1')).toHaveAttribute('data-kind', 'image');
  });

  test('highlighting dims everything not in the set', () => {
    render(<Chronology
      timeline={[
        entry('img-1', 'image', '1999-01-01', '1999-01-01'),
        entry('img-2', 'image', '1999-06-01', '1999-06-01'),
      ]}
      highlightIds={new Set(['img-1'])}
    />);
    expect(screen.getByTestId('chronology-img-1').className).not.toMatch(/dimmed/);
    expect(screen.getByTestId('chronology-img-2').className).toMatch(/dimmed/);
  });

  test('with no highlight set, nothing is dimmed', () => {
    render(<Chronology timeline={[entry('img-1', 'image', '1999-01-01', '1999-01-01')]} />);
    expect(screen.getByTestId('chronology-img-1').className).not.toMatch(/dimmed/);
  });
});
