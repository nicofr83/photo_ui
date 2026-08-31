import { useTexts } from '../../api/hooks/useTexts';
import { useTextSelection } from '../../api/hooks/useTextSelection';
import type { TextRef } from '../../api/contract/text';
import { TextKind } from '../../shared/enums';
import { ErrorBanner } from '../primitives/ErrorBanner';

import { NoteFromTextButton } from './NoteFromTextButton';
import styles from './PageDetail.module.css';
import { TextCard } from './TextCard';

interface Props {
  readonly documentId: string;
  /** Task-scoped: text selection (contract §4.5) needs it, same as every
   * other screen under a task. */
  readonly slug: string;
  readonly onShowPhotos?: (ref: TextRef) => void;
}

const key = (ref: TextRef): string => `${ref.kind}:${ref.id}`;

/**
 * V1.6, Nicolas: "click sur une page : on affiche la page en grand avec le
 * texte complet de la page ... possibilité de sélectionner du texte, et de
 * l'enregistrer comme note, comme pour le journal de bord." No facing scan —
 * spec §5.3, "le site web n'a pas de page" — and `kind: passage` only:
 * gallery captions are a different register (contract), already their own
 * list under the web source, never mixed into a document's own text.
 */
export function WebDocumentDetail({ documentId, slug, onShowPhotos }: Props): React.JSX.Element {
  const texts = useTexts(documentId, TextKind.PASSAGE);
  const selection = useTextSelection(slug);

  if (texts.error !== null) return <ErrorBanner error={texts.error} />;
  if (texts.isPending) return <p role="status">Chargement du document…</p>;

  // Pipeline order IS reading order for a web page (no notebook to riffle
  // through) — the only ordering that makes "texte complet" mean something.
  const passages = [...texts.data.items].sort((a, b) => a.ordinal - b.ordinal);
  const checked = passages.filter((t) => selection.selected.has(key(t.ref)));

  return (
    <div className={styles['detail']}>
      <div className={styles['texts']}>
        {selection.error !== null ? <ErrorBanner error={selection.error} /> : null}

        <section data-testid="block-notes">
          {passages.map((unit) => (
            <TextCard
              key={key(unit.ref)}
              unit={unit}
              // exactOptionalPropertyTypes: an optional prop must be omitted,
              // not explicitly set to undefined.
              {...(onShowPhotos === undefined ? {} : { onShowPhotos })}
              selected={selection.selected.has(key(unit.ref))}
              onToggleSelect={() => {
                void (selection.selected.has(key(unit.ref))
                  ? selection.remove([unit.ref])
                  : selection.add([unit.ref]));
              }}
            />
          ))}
        </section>

        {checked.length === 0 ? null : <NoteFromTextButton slug={slug} selected={checked} />}
      </div>
    </div>
  );
}
