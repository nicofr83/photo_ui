import { useRef, useState } from 'react';

import type { TextPage } from '../../api/contract/text';

import styles from './PageViewer.module.css';

interface Props {
  readonly page: TextPage;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

/**
 * Spec §5.4: the facing page for handwritten sources — 810 × 1250 px, too
 * dense to read at a panel's width without zoom and pan. Deliberately no
 * highlight of any kind: `pages.region` is NULL on every one of the 155
 * pages, so nothing here can promise to point at a passage on the image.
 */
export function PageViewer({ page }: Props): React.JSX.Element {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const zoomIn = (): void => { setScale((s) => Math.min(ZOOM_MAX, roundStep(s + ZOOM_STEP))); };
  const zoomOut = (): void => { setScale((s) => Math.max(ZOOM_MIN, roundStep(s - ZOOM_STEP))); };
  const reset = (): void => { setScale(1); setPan({ x: 0, y: 0 }); };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    dragRef.current = {
      startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y,
    };
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragging || dragRef.current === null) return;
    const { startX, startY, originX, originY } = dragRef.current;
    setPan({ x: originX + (event.clientX - startX), y: originY + (event.clientY - startY) });
  };

  const endDrag = (): void => {
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <div className={styles['viewer']}>
      <div className={styles['controls']}>
        <button className={styles['button']} type="button" onClick={zoomOut}>
          Zoom arrière
        </button>
        <button className={styles['button']} type="button" onClick={zoomIn}>
          Zoom avant
        </button>
        <button className={styles['button']} type="button" onClick={reset}>
          Réinitialiser
        </button>
      </div>

      <div
        className={styles['frame']}
        data-testid="page-surface"
        data-scale={scale}
        data-pan-x={pan.x}
        data-pan-y={pan.y}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <img
          className={styles['image']}
          src={page.imageUrl}
          alt={`Page ${page.label ?? String(page.ordinal)}`}
          width={page.width}
          height={page.height}
          draggable={false}
          style={{ transform: `translate(${String(pan.x)}px, ${String(pan.y)}px) scale(${String(scale)})` }}
        />
      </div>
    </div>
  );
}

function roundStep(value: number): number {
  // Floating point additions of 0.25 drift ("1.2999999999999998"); the UI
  // only ever needs two decimal places.
  return Math.round(value * 100) / 100;
}
