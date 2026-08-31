import { useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';

import { useSelection } from '../api/hooks/useSelection';
import type { PhotoListItem } from '../api/contract/photo';
import { fromSearchParams, toSearchParams } from '../domain/filterState';
import { SelectionReason } from '../shared/enums';
import { PhotoDetail } from '../ui/detail/PhotoDetail';
import { ImageNoteEditor } from '../ui/detail/ImageNoteEditor';
import { FilterPanel } from '../ui/filters/FilterPanel';
import { PhotoGrid } from '../ui/grid/PhotoGrid';
import { SelectedPhotoGrid } from '../ui/grid/SelectedPhotoGrid';
import { ErrorBanner } from '../ui/primitives/ErrorBanner';
import { FixedHeader } from '../ui/primitives/FixedHeader';
import scrollStyles from '../ui/primitives/FixedHeader.module.css';
import { ImageModal } from '../ui/primitives/ImageModal';
import { TaskNav } from '../ui/primitives/TaskNav';

import styles from './ImagesScreen.module.css';

export function ImagesScreen(): React.JSX.Element {
  const { slug = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [openPhoto, setOpenPhoto] = useState<string | null>(null);
  // V1.6, Nicolas: "un clic sur une image devrait afficher l'image en
  // grand" — the whole photo, not just its id: this screen does not
  // otherwise hold what PhotoGrid/SelectedPhotoGrid fetched internally.
  const [enlargedPhoto, setEnlargedPhoto] = useState<PhotoListItem | null>(null);
  // The usual modal focus trap (team-lead): `document.activeElement` at the
  // moment of opening IS the thumbnail button that was just clicked — no
  // extra plumbing through PhotoTile/PhotoGrid needed to remember it.
  const enlargeTriggerRef = useRef<HTMLElement | null>(null);
  const enlarge = (photo: PhotoListItem): void => {
    enlargeTriggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setEnlargedPhoto(photo);
  };
  const closeEnlarged = (): void => {
    setEnlargedPhoto(null);
    enlargeTriggerRef.current?.focus();
  };

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
              onEnlarge={enlarge}
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
              onEnlarge={enlarge}
              // V1.7, Nicolas: "en sélectionnant une photo un commentaire
              // devrait etre demandé" — the SAME note field as V1.6
              // (`selection.setNote`), asked for inline right at the moment
              // of selecting rather than left for the Revue to fill in.
              onComment={(cloudAssetId, note) => { void selection.setNote(cloudAssetId, note); }}
              // V1.6/V1.7: a comment retained across a deselect-then-
              // reselect (server-side) — lets the inline field catch up to
              // it once the reselect settles, instead of showing blank.
              notes={new Map(
                selection.images
                  .filter((i): i is typeof i & { note: string } => i.note !== null)
                  .map((i) => [i.cloudAssetId, i.note]),
              )}
            />
          )}

          {openPhoto === null ? null : (
            <PhotoDetail cloudAssetId={openPhoto} onClose={() => { setOpenPhoto(null); }} />
          )}

          {enlargedPhoto === null ? null : (
            <ImageModal src={enlargedPhoto.renderUrl} alt={enlargedPhoto.fileName} onClose={closeEnlarged}>
              {/* V1.6, Nicolas: a comment only makes sense on a SELECTED
                  image (TaskImageSelection.note) — browsing the general
                  grid does not imply retaining it. */}
              {selection.selected.has(enlargedPhoto.cloudAssetId) ? (
                <ImageNoteEditor
                  note={selection.images.find((i) => i.cloudAssetId === enlargedPhoto.cloudAssetId)?.note ?? null}
                  isPending={selection.isPending}
                  onSave={(note) => { void selection.setNote(enlargedPhoto.cloudAssetId, note); }}
                />
              ) : null}
            </ImageModal>
          )}
        </main>
      </div>
    </div>
  );
}
