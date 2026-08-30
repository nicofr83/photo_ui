import { TEXT_SOURCE_TITLES, TextSource } from '../../domain/textSource';

import styles from './SourcePicker.module.css';

interface Props {
  readonly value: TextSource;
  readonly onChange: (source: TextSource) => void;
}

/**
 * Spec §5.3: "un bouton global choisit la source... une seule à la fois."
 * `Object.values(TextSource)` fixes the order — logbook, ma-vie, web — same
 * order the spec lists them in.
 */
export function SourcePicker({ value, onChange }: Props): React.JSX.Element {
  return (
    <div className={styles['group']} role="group" aria-label="Source">
      {Object.values(TextSource).map((source) => (
        <label className={styles['option']} key={source}>
          <input
            type="radio"
            name="source"
            value={source}
            checked={value === source}
            onChange={() => { onChange(source); }}
          />
          {TEXT_SOURCE_TITLES[source]}
        </label>
      ))}
    </div>
  );
}
