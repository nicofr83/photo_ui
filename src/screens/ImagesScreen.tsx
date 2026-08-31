import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';

import { useSelection } from '../api/hooks/useSelection';
import { fromSearchParams, toSearchParams } from '../domain/filterState';
import { SelectionReason } from '../shared/enums';
import { PhotoDetail } from '../ui/detail/PhotoDetail';
import { FilterPanel } from '../ui/filters/FilterPanel';
import { PhotoGrid } from '../ui/grid/PhotoGrid';
import { SelectedPhotoGrid } from '../ui/grid/SelectedPhotoGrid';
import { ErrorBanner } from '../ui/primitives/ErrorBanner';
import { FixedHeader } from '../ui/primitives/FixedHeader';
import scrollStyles from '../ui/primitives/FixedHeader.module.css';
import { TaskNav } from '../ui/primitives/TaskNav';

import styles from './ImagesScreen.module.css';

export function ImagesScreen(): React.JSX.Element {
  const { slug = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [openPhoto, setOpenPhoto] = useState<string | null>(null);

  // The URL is the single source of truth for the filters, and anything the
  // contract does not define is dropped on the way in — forwarding it would be
  // a 400 at best and a whole-library result at worst.
  const filters = fromSearchParams(searchParams);
  const params = toSearchParams(filters);

  // V1.6: deliberately NOT part of `FilterState` — it never reaches
  // `/photos` (see FilterPanel.tsx). Read/written directly against the URL,
  // same as TextsScreen's own `?source=` axis.
  const selectedOnly = searchParams.get('selectedOnly') === 'true';
  const setSelectedOnly = (value: boolean): void => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set('selectedOnly', 'true'); else next.delete('selectedOnly');
      return next;
    });
  };

  const selection = useSelection(slug);

  // Traceability of the GESTURE: only the client knows which filters were
  // active when the user clicked. Contract question 3.
  const reasons = (): SelectionReason[] => {
    const because: SelectionReason[] = [];
    if (filters.dateFrom !== null) because.push(SelectionReason.DATE_RANGE);
    if (filters.albumPaths.length > 0) because.push(SelectionReason.ALBUM);
    return because.length === 0 ? [SelectionReason.MANUAL] : because;
  };

  return (
    <div className={styles['screen']}>
      <FixedHeader>
        <TaskNav slug={slug} />
      </FixedHeader>
      <div className={`${String(scrollStyles['scrolls'])} ${String(styles['layout'])}`}>
        <aside className={styles['aside']}>
          <FilterPanel
            filters={filters}
            onChange={(next) => {
              // A full replace via `toSearchParams` alone would drop
              // `selectedOnly` — it lives outside `FilterState` on purpose,
              // so it has to be re-applied on every OTHER axis's change too.
              const nextParams = toSearchParams(next);
              if (selectedOnly) nextParams.set('selectedOnly', 'true');
              setSearchParams(nextParams);
            }}
            selectedOnly={selectedOnly}
            onSelectedOnlyChange={setSelectedOnly}
          />
        </aside>

        <main>
          {selection.error !== null ? <ErrorBanner error={selection.error} /> : null}

          {selectedOnly ? (
            <SelectedPhotoGrid
              slug={slug}
              onToggle={(cloudAssetId) => { void selection.remove([cloudAssetId]); }}
              onOpen={setOpenPhoto}
            />
          ) : (
            <PhotoGrid
              params={params}
              selected={selection.selected}
              onToggle={(cloudAssetId) => {
                void (selection.selected.has(cloudAssetId)
                  ? selection.remove([cloudAssetId])
                  : selection.add([cloudAssetId], reasons()));
              }}
              onSelectAll={(ids) => { void selection.add(ids, reasons()); }}
              onOpen={setOpenPhoto}
            />
          )}

          {openPhoto === null ? null : (
            <PhotoDetail cloudAssetId={openPhoto} onClose={() => { setOpenPhoto(null); }} />
          )}
        </main>
      </div>
    </div>
  );
}
