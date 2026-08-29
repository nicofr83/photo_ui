import { useNavigate, useParams } from 'react-router';

import { useDocuments, useTexts } from '../api/hooks/useTexts';
import type { TextDocument, TextRef } from '../api/contract/text';
import { groupBySource } from '../domain/textSource';
import { ErrorBanner } from '../ui/primitives/ErrorBanner';
import { TaskNav } from '../ui/primitives/TaskNav';
import { TextCard } from '../ui/texts/TextCard';
import styles from '../ui/texts/TextCard.module.css';

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
 * A fourth section is coming — the 2003 gallery captions, whose link to a photo
 * is direct rather than computed from dates. It is not stubbed here: its
 * contract is still open (api-contract §11 question 11), and inventing its
 * shape now would be a guess the rest of the code would inherit.
 */
export function TextsScreen({ onShowPhotos }: Props): React.JSX.Element {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const documents = useDocuments();

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
    <div>
      <TaskNav slug={slug} />
      <h1>Textes</h1>
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
            <DocumentTexts key={document.id} document={document} onShowPhotos={showPhotos} />
          ))}
        </section>
      ))}
    </div>
  );
}

function DocumentTexts({
  document,
  onShowPhotos,
}: {
  readonly document: TextDocument;
  readonly onShowPhotos: (ref: TextRef) => void;
}): React.JSX.Element {
  const texts = useTexts(document.id);

  return (
    <>
      {texts.error !== null ? <ErrorBanner error={texts.error} /> : null}
      {texts.isPending ? <p role="status">Chargement…</p> : null}

      {texts.data?.items.map((unit) => (
        <TextCard key={`${unit.ref.kind}:${unit.ref.id}`} unit={unit} onShowPhotos={onShowPhotos} />
      ))}
    </>
  );
}
