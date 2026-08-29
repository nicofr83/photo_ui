import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';

import { useSelection } from '../api/hooks/useSelection';
import { fromSearchParams, toSearchParams } from '../domain/filterState';
import { SelectionReason } from '../shared/enums';
import { PhotoDetail } from '../ui/detail/PhotoDetail';
import { FilterPanel } from '../ui/filters/FilterPanel';
import { PhotoGrid } from '../ui/grid/PhotoGrid';
import { ErrorBanner } from '../ui/primitives/ErrorBanner';
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
    <>
      <TaskNav slug={slug} />
      <div className={styles['layout']}>
        <aside className={styles['aside']}>
          <FilterPanel
            filters={filters}
            onChange={(next) => { setSearchParams(toSearchParams(next)); }}
          />
        </aside>

        <main>
          {selection.error !== null ? <ErrorBanner error={selection.error} /> : null}

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

          {openPhoto === null ? null : (
            <PhotoDetail cloudAssetId={openPhoto} onClose={() => { setOpenPhoto(null); }} />
          )}
        </main>
      </div>
    </>
  );
}
