import { useState } from 'react';

import { useAlbums } from '../api/hooks/useAlbums';
import { useAlbumSpan } from '../api/hooks/useAlbumSpan';
import { useWebDocuments, useWebSpan } from '../api/hooks/useWebSpan';
import type { Album } from '../api/contract/album';
import type { AlbumSpanUpdateResult, WebDocumentRow } from '../api/contract/ref';
import type { TextDocument } from '../api/contract/text';
import { sortAlbumsByPath } from '../domain/albumOrder';
import { matchesSearch } from '../domain/searchFold';
import { isIsoDate } from '../shared/date_interface';
import { ResolvedDateView } from '../ui/date/ResolvedDate';
import { ErrorBanner } from '../ui/primitives/ErrorBanner';

import styles from './SettingsScreen.module.css';

const WARNING_LABEL: Record<string, (details: { prefixYear?: number; albumPath?: string }) => string> = {
  outside_prefix_year: (d) =>
    `L’intervalle saisi ne recouvre pas l’année du préfixe (${String(d.prefixYear)}).`,
  overlaps_album: (d) => `Chevauche l’album « ${d.albumPath ?? ''} ».`,
};

/**
 * Spec §5.7/contract §4.8: the three referentials only a person can fill.
 * Small screen, biggest yield of the whole app — 25 entries correct the
 * interval of 421 photos. Country aliases are not built here: neither the
 * spec's brief for this tranche nor T4's mandate named them.
 */
export function SettingsScreen(): React.JSX.Element {
  return (
    <section className={styles['screen']}>
      <h1>Réglages</h1>
      <AlbumSpans />
      <WebSpans />
    </section>
  );
}

function AlbumSpans(): React.JSX.Element {
  const albums = useAlbums();
  const [query, setQuery] = useState('');

  if (albums.error !== null) return <ErrorBanner error={albums.error} />;
  if (albums.isPending) return <p role="status">Chargement des albums…</p>;

  // Same order every screen that lists albums uses — domain/albumOrder.ts.
  const sorted = sortAlbumsByPath(albums.data.items);
  // Client-side: 82 albums fit in memory, no round trip for this. Substring,
  // never a prefix — "BVI" must find "2000-2001/2000-11-BVI".
  const filtered = sorted.filter((album) => matchesSearch(album.path, query));

  return (
    <section>
      <h2>Albums</h2>
      <label className={styles['field']}>
        Rechercher un album
        <input
          className={styles['control']}
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); }}
        />
      </label>
      <ul className={styles['list']} aria-label="Albums">
        {filtered.map((album) => (
          <AlbumRow key={album.path} album={album} />
        ))}
      </ul>
    </section>
  );
}

function AlbumRow({ album }: { readonly album: Album }): React.JSX.Element {
  const editor = useAlbumSpan();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<AlbumSpanUpdateResult | null>(null);

  const save = (): void => {
    if (!isIsoDate(dateFrom) || !isIsoDate(dateTo)) return;
    setResult(null);
    // The rejection is not swallowed: `editor.error` already surfaces it
    // reactively (useAlbumSpan's mutation state) — this catch only stops it
    // from also becoming an unhandled promise rejection.
    void editor.save({ albumPath: album.path, dateFrom, dateTo, note: note === '' ? null : note })
      .then((r) => { setResult(r); setDateFrom(''); setDateTo(''); setNote(''); })
      .catch(() => undefined);
  };

  const clear = (): void => {
    setResult(null);
    void editor.clear(album.path).then((r) => { setResult(r); }).catch(() => undefined);
  };

  return (
    <li
      className={styles['row']}
      data-testid={`album-row-${album.path}`}
    >
      <p className={styles['title']}>
        {/* The full path, not just the leaf: the list is sorted on it
            (sortAlbumsByPath), and an album name does not always carry its
            own year — without the parent set visible, the order looks
            arbitrary (Nicolas: an unsorted-LOOKING list he could not
            search, on a screen where the sort was already correct). */}
        {album.path}
        {/* Real data mostly has groupName === albumName — stating it twice
            is exactly the kind of collision that made this row overflow
            once the path above was added. Shown only when it says
            something the path does not. */}
        {album.groupName === null || album.groupName === album.albumName ? '' : ` — ${album.groupName}`}
        {' '}({album.photoCount} photo{album.photoCount > 1 ? 's' : ''})
      </p>

      <p className={styles['current']}>
        Actuellement : {album.span.from} → {album.span.to}
        {' '}
        <span className={album.span.presumed ? styles['presumed'] : styles['saisi']}>
          ({album.span.presumed ? 'présumé' : 'saisi'})
        </span>
        {album.span.presumed || album.span.note === null ? null : ` — ${album.span.note}`}
      </p>

      {/* Spec §4.8/§7.4: presented AS HINTS, never pre-filled — they are
          exactly the data the arbitration judged unreliable. */}
      {album.hints.fileNamePatterns.length > 0 ? (
        <p className={styles['hints']} data-testid="hint-file-patterns">
          Motifs relevés dans les noms de fichiers : {album.hints.fileNamePatterns.join(', ')}
        </p>
      ) : null}
      {album.hints.rejectedExifRange === null ? null : (
        <p className={styles['hints']} data-testid="hint-rejected-exif">
          EXIF écarté sur {album.hints.rejectedExifCount} photo
          {album.hints.rejectedExifCount > 1 ? 's' : ''} : {album.hints.rejectedExifRange.from} →{' '}
          {album.hints.rejectedExifRange.to} (souvent une date de scan).
        </p>
      )}

      {editor.error !== null ? <ErrorBanner error={editor.error} /> : null}

      <div className={styles['form']}>
        <label className={styles['field']}>
          Premier jour
          <input
            className={styles['control']}
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); }}
          />
        </label>
        <label className={styles['field']}>
          Dernier jour
          <input
            className={styles['control']}
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); }}
          />
        </label>
        <label className={styles['field']}>
          Note
          <input
            className={styles['control']}
            type="text"
            value={note}
            onChange={(e) => { setNote(e.target.value); }}
          />
        </label>
        <button
          className={styles['button']}
          type="button"
          disabled={editor.isPending || dateFrom === '' || dateTo === ''}
          onClick={save}
        >
          Enregistrer
        </button>
        {album.span.presumed ? null : (
          <button className={styles['button']} type="button" onClick={clear}>
            Effacer
          </button>
        )}
      </div>

      {result === null ? null : (
        <>
          {result.warnings.map((w) => (
            <p className={styles['warning']} key={w.code} data-testid="span-warning">
              {WARNING_LABEL[w.code]?.(w) ?? w.code}
            </p>
          ))}
          <p className={styles['report']} data-testid="recompute-report">
            {result.recomputed.photosAffected} photo
            {result.recomputed.photosAffected > 1 ? 's' : ''} recalculée
            {result.recomputed.photosAffected > 1 ? 's' : ''}, dont {result.recomputed.datesChanged}
            {' '}date{result.recomputed.datesChanged > 1 ? 's' : ''} modifiée
            {result.recomputed.datesChanged > 1 ? 's' : ''}.
          </p>
        </>
      )}
    </li>
  );
}

function WebSpans(): React.JSX.Element {
  const documents = useWebDocuments();

  if (documents.error !== null) return <ErrorBanner error={documents.error} />;
  if (documents.isPending) return <p role="status">Chargement des documents…</p>;

  return (
    <section>
      <h2>Site web</h2>
      <ul className={styles['list']} aria-label="Documents du site web">
        {documents.data.items.map((doc) => (
          <WebDocRow key={doc.documentId} row={doc} />
        ))}
      </ul>
    </section>
  );
}

function WebDocRow({ row }: { readonly row: WebDocumentRow }): React.JSX.Element {
  const editor = useWebSpan();
  const [dateFrom, setDateFrom] = useState('');
  const [note, setNote] = useState('');
  const [doc, setDoc] = useState<TextDocument | null>(null);

  // v1.5: a web span is a single START bound — the end is derived (the next
  // DATED document's day minus one, or this document's own day if it is
  // the last), never entered.
  const save = (): void => {
    if (!isIsoDate(dateFrom)) return;
    void editor.save({ documentId: row.documentId, dateFrom, note: note === '' ? null : note })
      .then((d) => { setDoc(d); setDateFrom(''); setNote(''); })
      .catch(() => undefined);
  };

  const clear = (): void => {
    void editor.clear(row.documentId).then((d) => { setDoc(d); }).catch(() => undefined);
  };

  const span = doc?.span ?? row.span;

  return (
    <li className={styles['row']} data-testid={`web-doc-${row.documentId}`}>
      <p className={styles['title']}>{row.title}</p>
      <p className={styles['current']}>{row.excerpt}</p>
      {/* Contract §4.8: the document's PATH is the only date hint — said as one. */}
      <p className={styles['hints']} data-testid="path-hint">Indice de date : {row.pathHint}</p>

      {span === null ? (
        <p className={styles['current']}>Aucune plage saisie.</p>
      ) : (
        <p className={styles['current']}><ResolvedDateView date={span} /></p>
      )}

      {editor.error !== null ? <ErrorBanner error={editor.error} /> : null}

      <div className={styles['form']}>
        <label className={styles['field']}>
          Premier jour
          <input
            className={styles['control']}
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); }}
          />
        </label>
        <label className={styles['field']}>
          Note
          <input
            className={styles['control']}
            type="text"
            value={note}
            onChange={(e) => { setNote(e.target.value); }}
          />
        </label>
        <button
          className={styles['button']}
          type="button"
          disabled={editor.isPending || dateFrom === ''}
          onClick={save}
        >
          Enregistrer
        </button>
        {span === null ? null : (
          <button className={styles['button']} type="button" onClick={clear}>
            Effacer
          </button>
        )}
      </div>
    </li>
  );
}
