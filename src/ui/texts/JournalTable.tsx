import { useQuery } from '@tanstack/react-query';

import { apiGet } from '../../api/client';
import { TaskDetailSchema } from '../../api/contract/task';
import type { TextUnit } from '../../api/contract/text';
import { ErrorBanner } from '../primitives/ErrorBanner';

import { JournalRow } from './JournalRow';
import styles from './JournalTable.module.css';

interface Props {
  readonly units: readonly TextUnit[];
  readonly slug: string;
  readonly noteTitle: string;
}

/**
 * Spec, "le registre en tableau": four fixed columns — Date (9rem), Texte
 * (the rest), Corriger (3rem), Créer une note (11rem). On a narrow screen
 * the table scrolls horizontally inside its own frame rather than crushing
 * the text column.
 */
export function JournalTable({ units, slug, noteTitle }: Props): React.JSX.Element {
  const task = useQuery({
    queryKey: ['task', slug],
    queryFn: ({ signal }) => apiGet(`/tasks/${slug}`, TaskDetailSchema, signal),
  });

  if (task.error !== null) return <ErrorBanner error={task.error} />;

  const notes = task.data?.notes ?? [];

  return (
    <div className={styles['scroller']}>
      <table className={styles['table']}>
        <thead>
          <tr>
            <th className={styles['date']}>Date</th>
            <th>Texte</th>
            <th className={styles['correct']}>Corriger</th>
            <th className={styles['noteCell']}>Créer une note</th>
          </tr>
        </thead>
        <tbody>
          {units.map((unit) => (
            <JournalRow
              key={unit.ref.id}
              unit={unit}
              slug={slug}
              noteTitle={noteTitle}
              existingNote={notes.find(
                (n) => n.derivedFrom?.kind === unit.ref.kind && n.derivedFrom.id === unit.ref.id,
              )}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
