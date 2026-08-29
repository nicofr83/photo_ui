import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../client';
import { TaskReviewSchema, type TaskReview } from '../contract/review';

/**
 * Contract §7.3: the eight counters and the timeline in one call — the
 * chronology is layout (derived client-side, see domain/chronology.ts), the
 * counters are not (recouvrement predicate, computed server-side so it never
 * drifts from GET /photos?overlapsText…).
 */
export function useTaskReview(slug: string): UseQueryResult<TaskReview> {
  return useQuery({
    queryKey: ['task', slug, 'review'],
    queryFn: ({ signal }) => apiGet(`/tasks/${slug}/review`, TaskReviewSchema, signal),
  });
}
