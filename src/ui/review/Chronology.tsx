import type { TaskReviewTimelineEntry } from '../../api/contract/review';
import { layoutTimeline } from '../../domain/chronology';

import styles from './Chronology.module.css';

interface Props {
  readonly timeline: readonly TaskReviewTimelineEntry[];
  /** From ControlBanner: dims everything else when a counter is active. */
  readonly highlightIds?: ReadonlySet<string> | null;
}

/**
 * Spec §5.6: images and texts on ONE axis — the only place that shows 200
 * undocumented photos of 2004 for what they are. All positioning happens in
 * `domain/chronology.layoutTimeline`; this component only places the
 * percentages it returns — a raw timeline entry carries no `source`, so it
 * could never go through `ResolvedDateView`, the sole place a date becomes
 * text (spec §7.1). Colour is `dateKind` directly: green reading, amber
 * inference, violet decision — same vocabulary as everywhere else here.
 */
export function Chronology({ timeline, highlightIds = null }: Props): React.JSX.Element {
  const laid = layoutTimeline(timeline);

  if (laid.length === 0) {
    return <p className={styles['empty']}>Rien à placer sur la chronologie pour l’instant.</p>;
  }

  return (
    <div className={styles['axis']} role="img" aria-label="Chronologie des images et des textes">
      {laid.map((entry) => (
        <span
          key={entry.id}
          className={[
            styles['entry'],
            highlightIds !== null && !highlightIds.has(entry.id) ? styles['dimmed'] : null,
          ].filter(Boolean).join(' ')}
          data-testid={`chronology-${entry.id}`}
          data-kind={entry.kind}
          data-date-kind={entry.dateKind}
          style={{ left: `${String(entry.leftPercent)}%`, width: `${String(entry.widthPercent)}%` }}
        />
      ))}
    </div>
  );
}
