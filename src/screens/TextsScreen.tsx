import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';

import { useTextsByKind } from '../api/hooks/useTexts';
import type { TextRef } from '../api/contract/text';
import { fromSearchParams, toSearchParams, type TextFilterState } from '../domain/textFilterState';
import { TextSource } from '../domain/textSource';
import { TextKind } from '../shared/enums';
import { ErrorBanner } from '../ui/primitives/ErrorBanner';
import { FixedHeader } from '../ui/primitives/FixedHeader';
import scrollStyles from '../ui/primitives/FixedHeader.module.css';
import { TaskNav } from '../ui/primitives/TaskNav';
import { PageDetail } from '../ui/texts/PageDetail';
import { PageList } from '../ui/texts/PageList';
import { SourcePicker } from '../ui/texts/SourcePicker';
import { TextCard } from '../ui/texts/TextCard';
import { TextFilterPanel } from '../ui/texts/TextFilterPanel';
import styles from '../ui/texts/TextCard.module.css';
import { WebDocumentDetail } from '../ui/texts/WebDocumentDetail';

import screenStyles from './TextsScreen.module.css';

/** The keys `textFilterState.ts`'s own `toSearchParams` owns — cleared and
 * rewritten together, `source` and `openPageId` untouched. */
const FILTER_PARAM_KEYS = ['year', 'dateFrom', 'dateTo', 'q'];

interface Props {
  /** Overridable for tests. Defaults to opening the grid pre-filtered on this
   * text's overlap window, within the current task. */
  readonly onShowPhotos?: (ref: TextRef) => void;
}

function isTextSource(value: string | null): value is TextSource {
  return value !== null && (Object.values(TextSource) as string[]).includes(value);
}

/**
 * v1.5, Tasks 8-9: the refonte — one source at a time (spec §5.3), its pages
 * listed by date or by notebook order, opened one at a time into
 * `PageDetail`. Gallery captions stay reachable here, under the web source
 * only — they are not pages and never join the page list.
 */
export function TextsScreen({ onShowPhotos }: Props): React.JSX.Element {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [openPageId, setOpenPageId] = useState<string | null>(null);

  const rawSource = searchParams.get('source');
  const source = isTextSource(rawSource) ? rawSource : TextSource.LOGBOOK;
  const filters = fromSearchParams(searchParams);

  const setSource = (next: TextSource): void => {
    setOpenPageId(null);
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set('source', next);
      // A year list (or facets) from one source rarely means anything for
      // another — carrying it across a source switch would silently filter
      // on a value the new source may not even contain.
      for (const key of FILTER_PARAM_KEYS) params.delete(key);
      return params;
    });
  };

  // Same discipline as the images filter panel (domain/filterState.ts): the
  // URL is the single source of truth, never a local `useState` a reload
  // would silently drop.
  const setFilters = (next: TextFilterState): void => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      for (const key of FILTER_PARAM_KEYS) params.delete(key);
      for (const [key, value] of toSearchParams(next)) params.append(key, value);
      return params;
    });
  };

  // Default: the grid pre-filtered on this text's overlap window, spec §4 —
  // "ouverture de la grille pré-filtrée sur la fenêtre d'un passage". Both
  // directions of overlap go through the same query parameters as the axis
  // itself (contract §4.2), so there is nothing new to invent here.
  const showPhotos = onShowPhotos ?? ((ref: TextRef) => {
    const params = new URLSearchParams({ overlapsTextKind: ref.kind, overlapsTextId: ref.id });
    void navigate(`/images/${slug}?${params.toString()}`);
  });

  return (
    <div className={screenStyles['screen']}>
      <FixedHeader>
        <TaskNav slug={slug} />
        <h1>Textes</h1>
        <SourcePicker value={source} onChange={setSource} />
      </FixedHeader>
      <div className={scrollStyles['scrolls']}>
        <div className={screenStyles['layout']}>
          <aside className={screenStyles['aside']}>
            <TextFilterPanel source={source} filters={filters} onChange={setFilters} />
          </aside>
          <main>
            {openPageId === null ? (
              <>
                <PageList source={source} onOpen={setOpenPageId} filters={filters} />
                {source === TextSource.WEB ? (
                  <GalleryCaptions onShowPhotos={showPhotos} />
                ) : null}
              </>
            ) : (
              <>
                <button
                  className={screenStyles['back']}
                  type="button"
                  onClick={() => { setOpenPageId(null); }}
                >
                  ← Retour à la liste
                </button>
                {source === TextSource.WEB ? (
                  <WebDocumentDetail documentId={openPageId} slug={slug} onShowPhotos={showPhotos} />
                ) : (
                  <PageDetail pageId={openPageId} slug={slug} onShowPhotos={showPhotos} />
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

/**
 * Spec, "ce que ce plan ne fait pas": indicative only — never selectable,
 * never filtered, never re-read. `TextCard` renders their checkbox/correct
 * affordances only when `onToggleSelect` is passed, so simply not passing it
 * here is what keeps them read-only.
 */
function GalleryCaptions({
  onShowPhotos,
}: {
  readonly onShowPhotos: (ref: TextRef) => void;
}): React.JSX.Element {
  const captions = useTextsByKind(TextKind.WEB_CAPTION);

  return (
    <section className={styles['section']} aria-label="Légendes de galerie">
      <h3>Légendes de galerie</h3>

      {captions.error !== null ? <ErrorBanner error={captions.error} /> : null}
      {captions.isPending ? <p role="status">Chargement…</p> : null}

      {captions.data?.items.map((unit) => (
        <TextCard key={`${unit.ref.kind}:${unit.ref.id}`} unit={unit} onShowPhotos={onShowPhotos} />
      ))}
    </section>
  );
}
