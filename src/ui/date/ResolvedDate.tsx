import { formatResolvedDate } from '../../domain/formatResolvedDate';
import type { DateArbitration, ResolvedDate } from '../../shared/date_interface';

import styles from './ResolvedDate.module.css';

interface Props {
  readonly date: ResolvedDate | null;
  /** The EXIF ↔ album arbitration, when the caller has it. Detail only. */
  readonly arbitration?: DateArbitration | null;
  readonly showDetail?: boolean;
}

/**
 * The ONLY component allowed to turn a date into text (spec §7.1).
 *
 * The nature travels in three channels, in this order of authority: the glyph,
 * the accessible name, then the colour. Colour is never alone — a reader who
 * cannot see it must still be told that a date is inferred.
 *
 * `noBareDateRendering.test.ts` fails the build if any other component under
 * `src/ui/` or `src/screens/` formats a date itself.
 */
export function ResolvedDateView({
  date,
  arbitration = null,
  showDetail = false,
}: Props): React.JSX.Element {
  const formatted = formatResolvedDate(date, arbitration);
  const showsDetail = showDetail && formatted.detail !== null;
  // The aria-label overrides the element's content, so anything shown on screen
  // must be repeated here or a screen reader never hears it.
  const label = showsDetail ? `${formatted.label} — ${formatted.detail}` : formatted.label;

  return (
    <span
      className={styles['date']}
      data-date-kind={formatted.kind}
      data-testid="resolved-date"
      aria-label={label}
    >
      {formatted.glyph === '' ? null : <span aria-hidden="true">{formatted.glyph} </span>}
      <span aria-hidden="true">{formatted.text}</span>
      {showsDetail ? (
        <span className={styles['detail']}> — {formatted.detail}</span>
      ) : null}
    </span>
  );
}
