import type { SystemStatus } from '../api/contract/system';

/**
 * Spec §5.1/§9: "volume démonté en session" means the ORIGINALS root
 * specifically — thumbnails, pages and the tasks directory are served from
 * elsewhere and stay usable. Vignettes and selections already loaded remain
 * usable; only the export (which needs the originals to render/copy) is
 * blocked.
 */
export function originalsUnavailable(status: SystemStatus): boolean {
  return status.roots.some((root) => root.name === 'originals' && !root.available);
}
