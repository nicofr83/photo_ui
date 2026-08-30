import styles from './FixedHeader.module.css';

/**
 * v1.5, Task 6: the band a screen never scrolls away — its own nav, title,
 * and controls. A `grid-template-rows: auto 1fr` on the SCREEN's own
 * wrapper is what actually keeps it in place; this is just that first row's
 * content, not `position: sticky` (which would create a stacking context
 * fighting the global volume banner above it).
 */
export function FixedHeader(
  { children }: { readonly children: React.ReactNode },
): React.JSX.Element {
  return (
    <div className={styles['fixed']} data-testid="fixed-header">
      {children}
    </div>
  );
}
