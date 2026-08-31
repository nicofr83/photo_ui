import { useEffect, useRef } from 'react';

import styles from './ImageModal.module.css';

interface Props {
  readonly src: string;
  readonly alt: string;
  readonly onClose: () => void;
  /** V1.6: an optional extra — e.g. the per-image note editor, wanted at
   * both places this modal is used (Images and Revue) and "un bon endroit"
   * for it (team-lead) since this is exactly when the photo fills the
   * screen. `ImageModal` stays a plain "enlarge an image" component with no
   * opinion on what that content is. */
  readonly children?: React.ReactNode;
}

/**
 * V1.6, Nicolas #3: "un clic sur la miniature de l'image devrait afficher
 * dans une fenêtre modale l'image... avec bouton pour fermer la fenêtre" —
 * a modal over a second tab (his own alternative): a tab loses the task's
 * context and forces a trip back (team-lead). The SAME component at both
 * Images and Revue (team-lead: two implementations would diverge).
 *
 * Closes on the button, Escape, or a click outside the image — never on a
 * click ON the image, which would make enlarging it to look closer
 * self-defeating. Focus moves onto the close button on mount and the
 * CALLER is responsible for returning it to the thumbnail that opened this
 * (the usual modal focus trap) — `ImageModal` has no way to know which
 * element that was.
 */
export function ImageModal({ src, alt, onClose, children }: Props): React.JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); };
  }, [onClose]);

  return (
    <div className={styles['backdrop']} onClick={onClose}>
      <div
        className={styles['dialog']}
        role="dialog"
        aria-modal="true"
        aria-label={alt}
        onClick={(event) => { event.stopPropagation(); }}
      >
        <button className={styles['close']} type="button" ref={closeRef} onClick={onClose}>
          Fermer
        </button>
        <img className={styles['image']} src={src} alt={alt} />
        {children === undefined ? null : (
          <div className={styles['extra']}>{children}</div>
        )}
      </div>
    </div>
  );
}
