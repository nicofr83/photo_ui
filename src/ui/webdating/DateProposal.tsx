import type { WebDateProposal } from '../../api/contract/ref';
import { formatDDMMYYYY } from '../../domain/isoDateFormat';

import styles from './DateProposal.module.css';

interface Props {
  readonly proposal: WebDateProposal | null;
  /** Writes the date into the CALLER's local field state — the proposal
   * itself never pre-fills anything (spec: an aid is shown as a hint,
   * never a value already typed). */
  readonly onAdopt: (isoDate: string) => void;
}

/**
 * v1.5, Task 12: what a proposal would apply, and what it is worth — spec
 * "L'écran propose une date... jamais écrite dans le champ." `date` here is
 * a plain suggested day, not a `ResolvedDate` (no kind/precision to lose
 * yet — nothing has been decided), so this stays outside `ResolvedDateView`'s
 * domain, same reasoning as a note's attribution date.
 */
export function DateProposal({ proposal, onAdopt }: Props): React.JSX.Element | null {
  if (proposal === null) return null;

  const allToDay = proposal.datedToDayCount === proposal.photoCount && proposal.photoCount > 0;

  return (
    <p className={styles['proposal']} data-testid="proposal">
      Proposition : {formatDDMMYYYY(proposal.date)} — {proposal.photoCount} photo
      {proposal.photoCount > 1 ? 's' : ''}, {allToDay ? 'toutes au jour' : 'seulement au mois'},
      {' '}sur {proposal.spanDays} jour{proposal.spanDays > 1 ? 's' : ''}.
      <button
        className={styles['adopt']}
        type="button"
        onClick={() => { onAdopt(proposal.date); }}
      >
        Adopter cette date
      </button>
    </p>
  );
}
