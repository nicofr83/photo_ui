import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { EMPTY_FILTERS, type FilterState } from '../../domain/filterState';
import { PhotoSort } from '../../shared/enums';
import { renderWithProviders } from '../../test/renderWithProviders';

import { FilterPanel } from './FilterPanel';

/**
 * FilterPanel is controlled, so the harness must actually hold the state and
 * feed it back. A harness that only records would let a component pass while
 * being unusable in the real app.
 */
function setup(initial: FilterState = EMPTY_FILTERS) {
  const changes: FilterState[] = [];

  function Harness(): React.JSX.Element {
    const [filters, setFilters] = useState(initial);
    return (
      <FilterPanel
        filters={filters}
        onChange={(next) => { changes.push(next); setFilters(next); }}
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

describe('the album axis', () => {
  test('albums are listed with their photo counts', async () => {
    setup();
    expect(await screen.findByRole('checkbox', { name: /Maison rose/ })).toBeInTheDocument();
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
