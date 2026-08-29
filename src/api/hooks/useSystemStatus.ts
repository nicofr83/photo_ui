import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../client';
import { SystemStatusSchema, type SystemStatus } from '../contract/system';

/**
 * Contract §4.1/§9: consulted at startup, and polled — a stale volume state
 * ("démonté en session") must not require a manual reload to be seen.
 */
export function useSystemStatus(): UseQueryResult<SystemStatus> {
  return useQuery({
    queryKey: ['system', 'status'],
    queryFn: ({ signal }) => apiGet('/system/status', SystemStatusSchema, signal),
    refetchInterval: 30_000,
  });
}
