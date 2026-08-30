import { usePages } from '../../api/hooks/usePages';
import { useTexts } from '../../api/hooks/useTexts';
import { useTextSelection } from '../../api/hooks/useTextSelection';
import type { TextRef } from '../../api/contract/text';
import { TextKind } from '../../shared/enums';
import { ErrorBanner } from '../primitives/ErrorBanner';

import { PageViewer } from './PageViewer';
import styles from './PageDetail.module.css';
import { TextCard } from './TextCard';

interface Props {
  readonly pageId: string;
  /** Task-scoped: text selection (contract §4.5) needs it, same as every
   * other screen under a task. */
  readonly slug: string;
  readonly onShowPhotos?: (ref: TextRef) => void;
}

const key = (ref: TextRef): string => `${ref.kind}:${ref.id}`;

/**
 * v1.5, Task 9: a page's own scan, whole, beside its texts split by nature —
 * spec "la page ouverte". `pageId` carries its document (`documentId/pNNN`),
 * so no separate prop repeats what the id already says.
 */
export function PageDetail({ pageId, slug, onShowPhotos }: Props): React.JSX.Element {
  const documentId = pageId.slice(0, pageId.lastIndexOf('/'));
  const pages = usePages(documentId);
  const texts = useTexts(documentId);
  const selection = useTextSelection(slug);

  if (pages.error !== null) return <ErrorBanner error={pages.error} />;
  if (pages.isPending) return <p role="status">Chargement de la page…</p>;

  const page = pages.data.items.find((p) => p.id === pageId);
  if (page === undefined) return <p role="alert">Page introuvable ({pageId}).</p>;

  const forThisPage = texts.data?.items.filter((t) => t.pageId === pageId) ?? [];
  const registre = forThisPage.filter((t) => t.ref.kind === TextKind.LOG_ENTRY);
  // Everything that is not a register line — passages, notes libres. On a
  // document with no register at all (spec: "Ma vie"), this is the ONLY
  // block, and it loses its title rather than showing an empty "Registre"
  // beside a lone, oddly-named section.
  const notes = forThisPage.filter((t) => t.ref.kind !== TextKind.LOG_ENTRY);

  const renderText = (unit: (typeof forThisPage)[number]): React.JSX.Element => (
    <TextCard
      key={key(unit.ref)}
      unit={unit}
      // exactOptionalPropertyTypes: an optional prop must be OMITTED, not
      // explicitly set to undefined — conditional spread, not a bare pass-through.
      {...(onShowPhotos === undefined ? {} : { onShowPhotos })}
      selected={selection.selected.has(key(unit.ref))}
      onToggleSelect={() => {
        void (selection.selected.has(key(unit.ref))
          ? selection.remove([unit.ref])
          : selection.add([unit.ref]));
      }}
    />
  );

  return (
    <div className={styles['detail']}>
      <PageViewer page={page} />
      <div className={styles['texts']}>
        {texts.error !== null ? <ErrorBanner error={texts.error} /> : null}
        {selection.error !== null ? <ErrorBanner error={selection.error} /> : null}

        {registre.length === 0 ? null : (
          <section data-testid="block-register">
            <h2>Registre</h2>
            {registre.map(renderText)}
          </section>
        )}

        <section data-testid="block-notes">
          {registre.length > 0 ? <h2>Notes de bord</h2> : null}
          {notes.map(renderText)}
        </section>
      </div>
    </div>
  );
}
