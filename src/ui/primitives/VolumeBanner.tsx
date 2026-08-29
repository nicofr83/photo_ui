import { useSystemStatus } from '../../api/hooks/useSystemStatus';
import { originalsUnavailable } from '../../domain/systemStatus';

import styles from './VolumeBanner.module.css';

/**
 * Spec §5.1/§9: ONE global banner, shown only when the originals volume is
 * unmounted — never four competing banners over the grid. Thumbnails, pages
 * and selections already loaded stay usable; only the export (which needs
 * the originals) is blocked, from wherever it is offered.
 */
export function VolumeBanner(): React.JSX.Element | null {
  const status = useSystemStatus();
  if (status.data === undefined || !originalsUnavailable(status.data)) return null;

  return (
    <p className={styles['banner']} role="alert" data-testid="volume-banner">
      Le volume des originaux est absent. Les vignettes et sélections déjà chargées
      restent utilisables ; l’export est bloqué tant qu’il n’est pas reconnecté.
    </p>
  );
}
