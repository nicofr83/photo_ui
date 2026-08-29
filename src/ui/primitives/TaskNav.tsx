import { NavLink } from 'react-router';

import styles from './TaskNav.module.css';

interface Props {
  readonly slug: string;
}

/**
 * The three task-scoped screens (images, texts, review) are separate routes,
 * never tabs of one component — each has its own URL and is reloadable and
 * shareable on its own. This is the one place that keeps moving between them
 * from losing the task slug.
 */
export function TaskNav({ slug }: Props): React.JSX.Element {
  return (
    <nav className={styles['nav']} aria-label="Écrans de la tâche">
      <NavLink to={`/images/${slug}`}>Images</NavLink>
      <NavLink to={`/textes/${slug}`}>Textes</NavLink>
      <NavLink to={`/revue/${slug}`}>Revue</NavLink>
    </nav>
  );
}
