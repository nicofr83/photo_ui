import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';

import { usePages } from '../api/hooks/usePages';
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
 * Each source reads very differently now — the journal has its own two
 * zones (`JournalPageDetail`: the registre table, and free prose sharing
 * "Ma vie"'s own `PageProse`), the web its own five-page reader —
 * so each gets its own detail component instead of one shared `PageDetail`.
 * The web source manages its own list/detail navigation entirely
 * (`SiteWebReader`, five fixed pages, never a `PageList` thumbnail list).
 *
 * `onShowPhotos` ("ouverture de la grille pré-filtrée sur la fenêtre d'un
 * passage", spec §4) had its only caller in the registre/notes `TextCard`
 * split this screen no longer renders anywhere — retired along with it,
 * confirmed unreachable from any other screen before removing it here.
 */
export function TextsScreen(): React.JSX.Element {
  const { slug = '' } = useParams();
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
                  <JournalPageDetail pageId={openPageId} slug={slug} />
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
