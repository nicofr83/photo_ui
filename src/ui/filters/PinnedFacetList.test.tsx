import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import type { FacetBucket } from '../../api/contract/photo';

import { PinnedFacetList } from './PinnedFacetList';

const bucket = (value: string): FacetBucket => ({ value, count: 1 });
const buckets: FacetBucket[] = [bucket('voile'), bucket('bateau'), bucket('mer'), bucket('ancre')];

function Harness({ initialChecked = [] as string[] }: { readonly initialChecked?: string[] }) {
  const [checked, setChecked] = useState<string[]>(initialChecked);
  return (
    <PinnedFacetList
      buckets={buckets}
      checked={checked}
      onToggle={(value) => {
        setChecked((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
      }}
    />
  );
}

describe('V1.7, Nicolas — checked facets pinned to the top, alphabetical below', () => {
  test('nothing checked: one alphabetical list, no pinned zone', () => {
    render(<Harness />);
    expect(screen.queryByTestId('pinned-facets')).not.toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.map((b) => b.getAttribute('aria-label'))).toEqual(['ancre', 'bateau', 'mer', 'voile']);
  });

  test('checking a value moves it into the pinned zone, out of the alphabetical rest', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('checkbox', { name: 'bateau' }));

    const pinned = screen.getByTestId('pinned-facets');
    expect(within(pinned).getByRole('checkbox', { name: 'bateau' })).toBeInTheDocument();

    const boxes = screen.getAllByRole('checkbox');
    // pinned first, then the alphabetical rest.
    expect(boxes.map((b) => b.getAttribute('aria-label'))).toEqual(['bateau', 'ancre', 'mer', 'voile']);
  });

  test('two checked values are alphabetical within the pinned zone too', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('checkbox', { name: 'voile' }));
    await user.click(screen.getByRole('checkbox', { name: 'ancre' }));

    const pinned = screen.getByTestId('pinned-facets');
    expect(within(pinned).getAllByRole('checkbox').map((b) => b.getAttribute('aria-label'))).toEqual(['ancre', 'voile']);
  });

  test('unchecking drops a value back to its alphabetical place in the rest', async () => {
    const user = userEvent.setup();
    render(<Harness initialChecked={['bateau']} />);
    await user.click(screen.getByRole('checkbox', { name: 'bateau' }));

    expect(screen.queryByTestId('pinned-facets')).not.toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.map((b) => b.getAttribute('aria-label'))).toEqual(['ancre', 'bateau', 'mer', 'voile']);
  });

  test('checking a value keeps keyboard focus ON that value, even though it moved container', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('checkbox', { name: 'mer' }));
    // It just left the flat list for the pinned zone — a naive re-render
    // would remount the node and drop focus to <body>. It must not.
    expect(screen.getByRole('checkbox', { name: 'mer' })).toHaveFocus();
  });

  test('unchecking a pinned value also keeps focus on it as it returns to the rest', async () => {
    const user = userEvent.setup();
    render(<Harness initialChecked={['mer']} />);
    await user.click(screen.getByRole('checkbox', { name: 'mer' }));
    expect(screen.getByRole('checkbox', { name: 'mer' })).toHaveFocus();
  });

  // Live finding: `usePhotoFacets` has no `placeholderData` — a filter
  // change is a NEW query key, so a real refetch renders at least once with
  // NO buckets at all before the new data lands (invisible against a
  // synchronous mock, real against the actual server — confirmed live:
  // `document.activeElement` was `<body>` after checking a real tag).
  test('a transient empty bucket list mid-refetch does not permanently lose the pending focus', async () => {
    const user = userEvent.setup();

    function FlakyHarness(): React.JSX.Element {
      const [checked, setChecked] = useState<string[]>([]);
      const [visible, setVisible] = useState<FacetBucket[]>(buckets);
      return (
        <PinnedFacetList
          buckets={visible}
          checked={checked}
          onToggle={(value) => {
            setChecked((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
            setVisible([]);
            setTimeout(() => { setVisible(buckets); }, 0);
          }}
        />
      );
    }

    render(<FlakyHarness />);
    await user.click(screen.getByRole('checkbox', { name: 'mer' }));
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'mer' })).toHaveFocus();
    });
  });
});
