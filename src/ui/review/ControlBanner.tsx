import { useState } from 'react';

import type { TaskReviewWarnings } from '../../api/contract/review';

import styles from './ControlBanner.module.css';

interface Props {
  readonly warnings: TaskReviewWarnings;
  /** Told which counter is toggled on, or null — so a caller can highlight
   * the matching entries elsewhere on the screen. */
  readonly onActiveChange?: (key: keyof TaskReviewWarnings | null) => void;
}

const LABELS: Record<keyof TaskReviewWarnings, string> = {
  undatedImages: 'Photos sans date',
  inferredDateImages: 'Photos à date déduite',
  uncertainTexts: 'Textes incertains',
  textsWiderThan30Days: 'Textes à fenêtre large (> 30 j)',
  imagesWithoutText: 'Photos sans texte',
  orphanedImages: 'Photos orphelines',
  orphanedTexts: 'Textes orphelins',
  imagesOutOfPeriod: 'Photos hors période',
};

const EXPLANATIONS: Record<keyof TaskReviewWarnings, string> = {
  undatedImages: 'Ces photos n’ont aucune date résolue.',
  inferredDateImages: 'La date de ces photos est déduite, pas lue — à vérifier au besoin.',
  uncertainTexts: 'La transcription de ces textes est jugée incertaine.',
  textsWiderThan30Days: 'La fenêtre de ces textes dépasse 30 jours — un recouvrement large, à juger.',
  imagesWithoutText: 'Aucun texte du corpus ne recouvre la date de ces photos.',
  orphanedImages: 'La photo sélectionnée n’est plus dans l’index — la sélection reste, marquée.',
  orphanedTexts: 'Le texte sélectionné n’existe plus dans le corpus — la sélection reste, marquée.',
  imagesOutOfPeriod: 'Ces photos sont datées hors de la période déclarée pour la tâche.',
};

/**
 * Spec §5.6: a control banner, NON-BLOCKING — every count is informational,
 * none refuses an export. Each is clickable (contract §7.3's own comment).
 * A zero is shown like any other count: §7.3's "rien n'est écarté en
 * silence" applies here too.
 */
export function ControlBanner({ warnings, onActiveChange }: Props): React.JSX.Element {
  const [active, setActive] = useState<keyof TaskReviewWarnings | null>(null);

  const toggle = (key: keyof TaskReviewWarnings): void => {
    const next = active === key ? null : key;
    setActive(next);
    onActiveChange?.(next);
  };

  const keys = Object.keys(LABELS) as (keyof TaskReviewWarnings)[];

  return (
    <div>
      <ul className={styles['banner']} aria-label="Bandeau de contrôle">
        {keys.map((key) => (
          <li key={key}>
            <button
              className={[styles['counter'], warnings[key] === 0 ? styles['counterZero'] : null]
                .filter(Boolean).join(' ')}
              type="button"
              aria-pressed={active === key}
              onClick={() => { toggle(key); }}
            >
              {LABELS[key]}
              <span className={styles['count']}>{warnings[key]}</span>
            </button>
          </li>
        ))}
      </ul>
      {active === null ? null : (
        <p className={styles['explanation']} data-testid="warning-explanation">
          {EXPLANATIONS[active]}
        </p>
      )}
    </div>
  );
}
