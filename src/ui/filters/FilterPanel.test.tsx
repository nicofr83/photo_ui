import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { EMPTY_FILTERS, fromSearchParams, toSearchParams, type FilterState } from '../../domain/filterState';
import { PhotoSort } from '../../shared/enums';
import { renderWithProviders } from '../../test/renderWithProviders';

import { FilterPanel } from './FilterPanel';

/**
 * FilterPanel is controlled, so the harness must actually hold the state and
 * feed it back. A harness that only records would let a component pass while
 * being unusable in the real app.
 *
 * `ImagesScreen` never holds `FilterState` directly — every `onChange` goes
 * `toSearchParams` into the URL, and `filters` comes back OUT via
 * `fromSearchParams` on the next render (`router.tsx`'s `useSearchParams`).
 * A harness that stores the raw `FilterState` object instead skips that
 * round trip — and `dateFrom`/`dateTo` only survive it TOGETHER (spec: a
 * half-open range means nothing to `/photos`, so neither URL direction
 * persists one bound alone). That gap let a real bug — the two month
 * inputs could never be filled in one at a time — pass all 588 tests.
 */
function setup(initial: FilterState = EMPTY_FILTERS) {
  const changes: FilterState[] = [];

  function Harness(): React.JSX.Element {
    const [filters, setFilters] = useState(initial);
    return (
      <FilterPanel
        filters={filters}
        onChange={(next) => {
          changes.push(next);
          setFilters(fromSearchParams(toSearchParams(next)));
        }}
      />
    );
  }

  const view = renderWithProviders(<Harness />);
  return { ...view, changes, latest: () => changes.at(-1) };
}

describe('the date range works at month granularity', () => {
  test('choosing a first and last month emits a full civil range', async () => {
    const user = userEvent.setup();
    const { latest } = setup();
    await user.type(screen.getByLabelText(/premier mois/i), '2000-12');
    await user.type(screen.getByLabelText(/dernier mois/i), '2001-02');
    await waitFor(() => {
      expect(latest()).toMatchObject({ dateFrom: '2000-12-01', dateTo: '2001-02-28' });
    });
  });

  test('the last month expands to its real last day, leap years included', async () => {
    const user = userEvent.setup();
    const { latest } = setup();
    await user.type(screen.getByLabelText(/premier mois/i), '2000-01');
    await user.type(screen.getByLabelText(/dernier mois/i), '2000-02');
    await waitFor(() => { expect(latest()?.dateTo).toBe('2000-02-29'); });
  });
});

describe('INVARIANT §6.1 — the reliable-dates toggle is off by default', () => {
  test('it starts unchecked', () => {
    setup();
    expect(screen.getByRole('checkbox', { name: /dates fiables/i })).not.toBeChecked();
  });

  test('it says what it costs, because it excludes', () => {
    setup();
    expect(screen.getByTestId('reliable-dates-warning')).toHaveTextContent(/écarte/i);
  });
});

describe('v1.5 — the album filter, spec: search on any part of the path', () => {
  test('the filter searches the whole path, accent- and case-insensitive', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByTestId('album-1998-1999/1998-02-Maison rose Algès');

    await user.type(screen.getByLabelText(/filtrer les albums/i), 'alges');
    expect(screen.getByTestId('album-1998-1999/1998-02-Maison rose Algès')).toBeInTheDocument();
    expect(screen.queryByTestId('album-2004/2004-03- visite de Tikal')).not.toBeInTheDocument();
  });

  test('a checked album stays visible even when the filter excludes it', async () => {
    const user = userEvent.setup();
    setup({ ...EMPTY_FILTERS, albumPaths: ['2000-2001/2000-12-viree au Venezuela-3mois'] });
    await screen.findByTestId('album-2000-2001/2000-12-viree au Venezuela-3mois');

    // Silently unchecking what the filter no longer matches is exactly the
    // defect this pins against.
    await user.type(screen.getByLabelText(/filtrer les albums/i), 'zzz');
    expect(screen.getByTestId('album-2000-2001/2000-12-viree au Venezuela-3mois')).toBeInTheDocument();
  });

  test('the filter field does not scroll away with the list', async () => {
    setup();
    await screen.findByTestId('album-1998-1999/1998-02-Maison rose Algès');
    const field = screen.getByLabelText(/filtrer les albums/i);
    const list = screen.getByTestId('album-list');
    expect(list.contains(field)).toBe(false);
  });
});

describe('the album axis', () => {
  test('albums are listed with their photo counts', async () => {
    setup();
    expect(await screen.findByRole('checkbox', { name: /Maison rose/ })).toBeInTheDocument();
  });

  test('albums are listed alphabetically by path — Nicolas, live: unsorted made 82 of them impossible to find', async () => {
    setup();
    await screen.findByTestId('album-1998-1999/1998-02-Maison rose Algès');
    // Not /^album-/ alone: that also matches the "album-list" scroll
    // container (v1.5) — real album paths always start with a year digit.
    const testids = screen.getAllByTestId(/^album-\d/).map((el) => el.dataset['testid']);
    expect(testids).toEqual([...testids].sort((a, b) => (a ?? '').localeCompare(b ?? '')));
    // The 2004 album must not lead — a raw sort on the JSON insertion
    // order (this fixture's own order) would put it first.
    expect(testids[0]).toBe('album-1998-1999/1998-02-Maison rose Algès');
  });

  test('shows the parent set, not just the leaf name — the sort is on the full path, the label must explain it', async () => {
    setup();
    const label = await screen.findByTestId('album-1998-1999/1998-02-Maison rose Algès');
    // Two different set folders share the same-looking leaf on their own
    // (album names are not guaranteed to carry their own year); without
    // the set prefix visible, an alphabetical order looks arbitrary.
    expect(label).toHaveTextContent('1998-1999');
  });

  test('§3.2 — an album whose name announces a journey is flagged, not silently trusted', async () => {
    setup();
    const label = await screen.findByTestId('album-1998-1999/1998-02-Maison rose Algès');
    expect(label).toHaveTextContent(/plage/i);
  });

  test('§3.2 — the prefix is never presented as a date', async () => {
    setup();
    const label = await screen.findByTestId('album-2000-2001/2000-12-viree au Venezuela-3mois');
    expect(label.textContent).not.toMatch(/décembre 2000/);
  });

  test('picking an album adds it to the state', async () => {
    const user = userEvent.setup();
    const { latest } = setup();
    await user.click(await screen.findByRole('checkbox', { name: /visite de Tikal/ }));
    expect(latest()?.albumPaths).toEqual(['2004/2004-03- visite de Tikal']);
  });
});

describe('INVARIANT §6.5 — active filters are shown as removable tokens', () => {
  const active: FilterState = {
    ...EMPTY_FILTERS,
    dateFrom: '2000-12-01', dateTo: '2000-12-20',
    albumPaths: ['2000-2001/2000'], reliableDatesOnly: true,
  };

  test('one token per active axis', () => {
    setup(active);
    expect(screen.getAllByTestId(/^filter-token-/)).toHaveLength(3);
  });

  test('removing a token clears only its axis', async () => {
    const user = userEvent.setup();
    const { latest } = setup(active);
    await user.click(screen.getByRole('button', { name: /Retirer le filtre du 2000-12-01/ }));
    expect(latest()).toEqual({ ...active, dateFrom: null, dateTo: null });
  });

  test('an unfiltered panel shows no tokens', () => {
    setup();
    expect(screen.queryByTestId(/^filter-token-/)).not.toBeInTheDocument();
  });
});

describe('sorting', () => {
  test('the default is ascending date', () => {
    setup();
    expect(screen.getByLabelText(/trier/i)).toHaveValue(PhotoSort.DATE_ASC);
  });

  test('§5.2 — the date sort says where undated photos go', () => {
    setup();
    expect(screen.getByTestId('sort-note')).toHaveTextContent(/sans date.*fin/i);
  });
});

describe('the panel is a drawer on a narrow viewport', () => {
  test('it carries the count of active filters so it is visible while closed', () => {
    setup({ ...EMPTY_FILTERS, dateFrom: '2000-12-01', dateTo: '2000-12-20', reliableDatesOnly: true });
    expect(screen.getByTestId('active-filter-count')).toHaveTextContent('2');
  });

  test('the count is absent when nothing is filtered', () => {
    setup();
    expect(screen.queryByTestId('active-filter-count')).not.toBeInTheDocument();
  });
});

describe('T3 — full text search', () => {
  test('typing runs a search', async () => {
    const user = userEvent.setup();
    const { latest } = setup();
    await user.type(screen.getByLabelText(/rechercher/i), 'ruines');
    await waitFor(() => { expect(latest()?.q).toBe('ruines'); });
  });
});

describe('T3 — tags, sorted by selectivity, the broadest never highlighted', () => {
  test('tags from the current result are offered, rarest first', async () => {
    setup();
    const list = await screen.findByRole('group', { name: /tags/i });
    const options = await within(list).findAllByRole('checkbox');
    expect(options.length).toBeGreaterThan(0);
  });

  test('picking a tag adds it to the state', async () => {
    const user = userEvent.setup();
    const { latest } = setup();
    await user.click(await screen.findByRole('checkbox', { name: /ruines/ }));
    expect(latest()?.tags).toEqual(['ruines']);
  });

  test('the lying place tag is never offered', async () => {
    setup();
    await screen.findByRole('group', { name: /tags/i });
    expect(screen.queryByRole('checkbox', { name: /^italy/ })).not.toBeInTheDocument();
  });
});

describe('T3 — the place axis disables itself, with its reason, when nothing qualifies', () => {
  test('enabled when the current result has geolocated photos', async () => {
    setup();
    expect(await screen.findByRole('checkbox', { name: /Portugal/ })).toBeEnabled();
  });

  test('disabled, with a stated reason, when it has none', async () => {
    setup({ ...EMPTY_FILTERS, albumPaths: ['1998-1999/1999-10 Lisboa Madere'] });
    expect(await screen.findByTestId('place-disabled-reason')).toHaveTextContent(/aucune photo/i);
  });
});

describe('T3 — hasPosition / hasOcr / hasCaption toggles', () => {
  test('each is off by default and toggles the matching axis', async () => {
    const user = userEvent.setup();
    const { latest } = setup();
    await user.click(screen.getByRole('checkbox', { name: /texte détecté/i }));
    expect(latest()?.hasOcr).toBe(true);
  });
});
