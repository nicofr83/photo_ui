import { useNavigate, useParams } from 'react-router';

import { useDocuments, useTexts, useTextsByKind } from '../api/hooks/useTexts';
import { useTextSelection, type TextSelection } from '../api/hooks/useTextSelection';
import type { TextDocument, TextRef } from '../api/contract/text';
import { groupBySource, TextSource } from '../domain/textSource';
import { TextKind } from '../shared/enums';
import { ErrorBanner } from '../ui/primitives/ErrorBanner';
import { FixedHeader } from '../ui/primitives/FixedHeader';
import scrollStyles from '../ui/primitives/FixedHeader.module.css';
import { TaskNav } from '../ui/primitives/TaskNav';
import { TextCard } from '../ui/texts/TextCard';
import styles from '../ui/texts/TextCard.module.css';

import screenStyles from './TextsScreen.module.css';

interface Props {
  /** Overridable for tests. Defaults to opening the grid pre-filtered on this
   * text's overlap window, within the current task. */
  readonly onShowPhotos?: (ref: TextRef) => void;
}

/**
 * Spec §5.3: three sources, three sections, never mixed. They have neither the
 * same date granularity nor the same standing, and merging them would let a
 * web caption borrow the certainty of a logbook entry.
 *
 * A fourth kind lives inside the web section, as its own subsection — the
 * 2003-2004 gallery captions, whose link to a photo is DIRECT rather than
 * computed from dates (contract §11 Q11, recommendation (a), proposed to
 * `back`, not yet frozen in docs/api-contract.md). `DocumentTexts` below
 * excludes them from the flat per-document listing; `GalleryCaptions`
 * renders them once, across every web document, since they do not belong to
 * any one document's page-by-page reading the way a passage does.
 */
export function TextsScreen({ onShowPhotos }: Props): React.JSX.Element {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const documents = useDocuments();
  // Contract §4.5: the text equivalent of the grid's photo selection —
  // closes the gap flagged in ETAT-TRAVAUX.md when the review chronology
  // (T5) turned out to need it sooner than expected.
  const selection = useTextSelection(slug);

  // Default: the grid pre-filtered on this text's overlap window, spec §4 —
  // "ouverture de la grille pré-filtrée sur la fenêtre d'un passage". Both
  // directions of overlap go through the same query parameters as the axis
  // itself (contract §4.2), so there is nothing new to invent here.
  const showPhotos = onShowPhotos ?? ((ref: TextRef) => {
    const params = new URLSearchParams({ overlapsTextKind: ref.kind, overlapsTextId: ref.id });
    void navigate(`/images/${slug}?${params.toString()}`);
  });

  if (documents.error !== null) return <ErrorBanner error={documents.error} />;
  if (documents.isPending) return <p role="status">Chargement des documents…</p>;

  return (
    <div className={screenStyles['screen']}>
      <FixedHeader>
        <TaskNav slug={slug} />
        <h1>Textes</h1>
      </FixedHeader>
      <div className={scrollStyles['scrolls']}>
      {groupBySource(documents.data.items).map((group) => (
        <section className={styles['section']} key={group.source} aria-label={group.title}>
          <h2>{group.title}</h2>

          {/* Spec §5.3: the web site has no page. Say so rather than showing an
              empty frame the user would take for a loading failure. */}
          {group.documents.every((document) => !document.hasPages) ? (
            <p className={styles['noPages']} data-testid="no-pages">
              Cette source n’a pas de page scannée en regard.
            </p>
          ) : null}

          {group.documents.map((document) => (
            <DocumentTexts
              key={document.id}
              document={document}
              onShowPhotos={showPhotos}
              selection={selection}
            />
          ))}

          {group.source === TextSource.WEB ? (
            <GalleryCaptions onShowPhotos={showPhotos} selection={selection} />
          ) : null}
        </section>
      ))}
      </div>
    </div>
  );
}

function DocumentTexts({
  document,
  onShowPhotos,
  selection,
}: {
  readonly document: TextDocument;
  readonly onShowPhotos: (ref: TextRef) => void;
  readonly selection: TextSelection;
}): React.JSX.Element {
  const texts = useTexts(document.id);

  return (
    <>
      {texts.error !== null ? <ErrorBanner error={texts.error} /> : null}
      {texts.isPending ? <p role="status">Chargement…</p> : null}

      {/* Gallery captions render once for the whole source, in
          GalleryCaptions below — never mixed into a document's own passages. */}
      {texts.data?.items
        .filter((unit) => unit.ref.kind !== TextKind.WEB_CAPTION)
        .map((unit) => (
          <TextCard
            key={`${unit.ref.kind}:${unit.ref.id}`}
            unit={unit}
            onShowPhotos={onShowPhotos}
            selected={selection.selected.has(`${unit.ref.kind}:${unit.ref.id}`)}
            onToggleSelect={() => {
              void (selection.selected.has(`${unit.ref.kind}:${unit.ref.id}`)
                ? selection.remove([unit.ref])
                : selection.add([unit.ref]));
            }}
          />
        ))}
    </>
  );
}

function GalleryCaptions({
  onShowPhotos,
  selection,
}: {
  readonly onShowPhotos: (ref: TextRef) => void;
  readonly selection: TextSelection;
}): React.JSX.Element {
  const captions = useTextsByKind(TextKind.WEB_CAPTION);

  return (
    <section className={styles['section']} aria-label="Légendes de galerie">
      <h3>Légendes de galerie</h3>

      {captions.error !== null ? <ErrorBanner error={captions.error} /> : null}
      {captions.isPending ? <p role="status">Chargement…</p> : null}

      {captions.data?.items.map((unit) => (
        <TextCard
          key={`${unit.ref.kind}:${unit.ref.id}`}
          unit={unit}
          onShowPhotos={onShowPhotos}
          selected={selection.selected.has(`${unit.ref.kind}:${unit.ref.id}`)}
          onToggleSelect={() => {
            void (selection.selected.has(`${unit.ref.kind}:${unit.ref.id}`)
              ? selection.remove([unit.ref])
              : selection.add([unit.ref]));
          }}
        />
      ))}
    </section>
  );
}
