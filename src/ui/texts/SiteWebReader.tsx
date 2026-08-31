import { useRef, useState } from 'react';

import { useNotes } from '../../api/hooks/useNotes';
import { useWebSitePages, webSitePageUrl } from '../../api/hooks/useTexts';
import type { WebSitePage } from '../../api/contract/text';
import { attributionTitle } from '../../domain/noteTitle';
import { TextSource } from '../../domain/textSource';
import { ErrorBanner } from '../primitives/ErrorBanner';
import { NoteEditor } from '../notes/NoteEditor';

import styles from './SiteWebReader.module.css';

interface Props {
  readonly slug: string;
}

/**
 * Spec, "Le site web": five real archive pages, alphabetical (= chronological
 * for these names) — no filter, five entries read at a glance. Replaces the
 * old flat list of extracted passages, fragmentary by nature (`web_caption`
 * only, never a page's complete text).
 */
export function SiteWebReader({ slug }: Props): React.JSX.Element {
  const pages = useWebSitePages();
  const [openId, setOpenId] = useState<string | null>(null);

  if (pages.error !== null) return <ErrorBanner error={pages.error} />;
  if (pages.isPending) return <p role="status">Chargement des pages…</p>;

  const open = pages.data.items.find((p) => p.id === openId);

  if (open === undefined) {
    return (
      <ul className={styles['list']} aria-label="Pages du site">
        {pages.data.items.map((page) => (
          <li key={page.id}>
            <button
              className={styles['pageButton']}
              type="button"
              onClick={() => { setOpenId(page.id); }}
            >
              {page.title}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className={styles['detail']}>
      <button className={styles['back']} type="button" onClick={() => { setOpenId(null); }}>
        ← Retour aux pages
      </button>
      <SiteWebPage page={open} slug={slug} />
    </div>
  );
}

/**
 * `sandbox="allow-same-origin"`, deliberately WITHOUT `allow-scripts` —
 * spec's own reasoning, both halves matter: without `allow-same-origin` the
 * selection inside the frame is unreadable from here; with `allow-scripts`
 * a 2003 FrontPage navigation script would run. The page is served
 * genuinely same-origin (`/texts/web/page`), so `contentDocument` is
 * reachable once loaded.
 */
function SiteWebPage({ page, slug }: { readonly page: WebSitePage; readonly slug: string }): React.JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [selectedText, setSelectedText] = useState('');
  const [creating, setCreating] = useState(false);
  const notes = useNotes(slug);

  const onLoad = (): void => {
    const doc = iframeRef.current?.contentDocument;
    if (doc === null || doc === undefined) return;
    doc.addEventListener('selectionchange', () => {
      const selection = doc.defaultView?.getSelection() ?? null;
      setSelectedText(selection === null || selection.isCollapsed ? '' : selection.toString());
    });
  };

  const noteTitle = attributionTitle({ source: TextSource.WEB, documentTitle: page.title, span: null });
  // Verified against the real corpus (GET /documents): the pipeline
  // document id is `web/<label>` — the filename's own years, not `page.id`
  // (which carries the `.htm` the page-serving route needs instead).
  const documentId = `web/${page.label}`;

  const createNote = (text: string): void => {
    void notes.create({
      title: noteTitle, text,
      attachedTo: { images: [], texts: [] },
      derivedFrom: { kind: 'page', id: documentId },
    }).then(() => {
      setCreating(false);
      setSelectedText('');
      iframeRef.current?.contentDocument?.defaultView?.getSelection()?.removeAllRanges();
    });
  };

  return (
    <div className={styles['pageWrap']}>
      <iframe
        ref={iframeRef}
        className={styles['frame']}
        src={webSitePageUrl(page.id)}
        title={page.title}
        sandbox="allow-same-origin"
        onLoad={onLoad}
      />

      {notes.error !== null ? <ErrorBanner error={notes.error} /> : null}

      {selectedText.trim() === '' || creating ? null : (
        <button className={styles['createButton']} type="button" onClick={() => { setCreating(true); }}>
          Créer une note
        </button>
      )}

      {!creating ? null : (
        <NoteEditor
          initialText={selectedText}
          onCreate={createNote}
          onCancel={() => { setCreating(false); }}
          isPending={notes.isPending}
          error={notes.error}
        />
      )}
    </div>
  );
}
