import type { TaskReviewTimelineEntry } from '../api/contract/review';

/**
 * Spec §5.6/contract §7.3: images and texts on ONE axis — the only place
 * that shows 200 undocumented photos of 2004 for what they are. This
 * computes LAYOUT (a position and a width), never text: a date becomes text
 * only through `ResolvedDateView` (spec §7.1's capital rule, enforced by
 * `src/ui/date/noBareDateRendering.test.ts`), which a raw timeline entry
 * cannot go through — it has no `source`, only `dateKind`. Colour comes from
 * `dateKind` directly in the caller; this only places things on the line.
 */
export interface TimelineLayoutEntry {
  readonly id: string;
  readonly kind: TaskReviewTimelineEntry['kind'];
  readonly dateKind: TaskReviewTimelineEntry['dateKind'];
  /** 0–100, the entry's start relative to the whole timeline's span. */
  readonly leftPercent: number;
  /** 0–100, never 0 even for a single day — always visible. */
  readonly widthPercent: number;
}

const MIN_WIDTH_PERCENT = 0.5;

export function layoutTimeline(
  entries: readonly TaskReviewTimelineEntry[],
): TimelineLayoutEntry[] {
  if (entries.length === 0) return [];

  const toMs = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

  const axisStart = Math.min(...entries.map((e) => toMs(e.start)));
  const axisEnd = Math.max(...entries.map((e) => toMs(e.end)));
  const span = Math.max(axisEnd - axisStart, 1);

  return [...entries]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((e) => {
      const start = toMs(e.start);
      const end = toMs(e.end);
      return {
        id: e.id,
        kind: e.kind,
        dateKind: e.dateKind,
        leftPercent: ((start - axisStart) / span) * 100,
        widthPercent: Math.max(((end - start) / span) * 100, MIN_WIDTH_PERCENT),
      };
    });
}
