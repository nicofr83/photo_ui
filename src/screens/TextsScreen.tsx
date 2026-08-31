import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';

import { usePages } from '../api/hooks/usePages';
import type { TextRef } from '../api/contract/text';
import { TextSource } from '../domain/textSource';
import { ErrorBanner } from '../ui/primitives/ErrorBanner';
import { FixedHeader } from '../ui/primitives/FixedHeader';
import scrollStyles from '../ui/primitives/FixedHeader.module.css';
import { TaskNav } from '../ui/primitives/TaskNav';
import { JournalPageDetail } from '../ui/texts/JournalPageDetail';
import { MaVieReader } from '../ui/texts/MaVieReader';
import { PageList } from '../ui/texts/PageList';
import { SiteWebReader } from '../ui/texts/SiteWebReader';
import { SourcePicker } from '../ui/texts/SourcePicker';

import screenStyles from './TextsScreen.module.css';

interface Props {
  /** Overridable for tests. Defaults to opening the grid pre-filtered on this
   * text's overlap window, within the current task. */
  readonly onShowPhotos?: (ref: TextRef) => void;
}

function isTextSource(value: string | null): value is TextSource {
  return value !== null && (Object.values(TextSource) as string[]).includes(value);
}

/**
 * V1.7, spec "en bref": the filter column is gone — "les filtres de gauche
 * disparaissent là où ils ne servaient à rien" is true of all three
 * sources now (the journal's own words: "elle disparaît de cet écran";
 * "Ma vie": "même écran, même disparition"; the web: "aucun filtre").
 * `TextFilterPanel` no longer has a caller here.
 *
 * Each source reads very differently now — the journal is a table, "Ma
 * vie" one continuous text, the web its own five-page reader — so each
 * gets its own detail component instead of one shared `PageDetail`. The
 * web source manages its own list/detail navigation entirely (`SiteWebReader`,
 * five fixed pages, never a `PageList` thumbnail list).
 */
export function TextsScreen({ onShowPhotos }: Props): React.JSX.Element {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [openPageId, setOpenPageId] = useState<string | null>(null);

  const rawSource = searchParams.get('source');
  const source = isTextSource(rawSource) ? rawSource : TextSource.LOGBOOK;

  const setSource = (next: TextSource): void => {
    setOpenPageId(null);
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set('source', next);
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
          <main className={screenStyles['full']}>
            {source === TextSource.WEB ? (
              <SiteWebReader slug={slug} />
            ) : openPageId === null ? (
              <PageList source={source} onOpen={setOpenPageId} />
            ) : (
              <>
                <button
                  className={screenStyles['back']}
                  type="button"
                  onClick={() => { setOpenPageId(null); }}
                >
                  ← Retour aux pages
                </button>
                {source === TextSource.MA_VIE ? (
                  <MaViePage pageId={openPageId} slug={slug} />
                ) : (
                  <JournalPageDetail pageId={openPageId} slug={slug} onShowPhotos={showPhotos} />
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
 * `MaVieReader` takes a `TextPage`, not an id — it needs the page's own
 * date/ordinal for the note title, and `PageViewer` needs its full shape.
 * Small enough to fetch inline rather than adding a fourth prop to thread
 * a page down through the tree.
 */
function MaViePage({ pageId, slug }: { readonly pageId: string; readonly slug: string }): React.JSX.Element {
  const documentId = pageId.slice(0, pageId.lastIndexOf('/'));
  const pages = usePages(documentId);

  if (pages.error !== null) return <ErrorBanner error={pages.error} />;
  if (pages.isPending) return <p role="status">Chargement de la page…</p>;

  const page = pages.data.items.find((p) => p.id === pageId);
  if (page === undefined) return <p role="alert">Page introuvable ({pageId}).</p>;

  return <MaVieReader page={page} slug={slug} />;
}
