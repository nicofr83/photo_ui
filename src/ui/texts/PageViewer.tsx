import { useEffect, useRef, useState } from 'react';

import type { TextPage } from '../../api/contract/text';

import styles from './PageViewer.module.css';

interface Props {
  readonly page: TextPage;
  /** V1.7, spec journal: "toute la largeur disponible, et sa hauteur va
   * jusqu'à environ les deux tiers de la fenêtre" — a page open on its own
   * screen reads better bigger than the 32rem cap every other caller (the
   * facing-page panel beside a text) still uses. */
  readonly large?: boolean;
}

const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

/**
 * Spec §5.4: the facing page for handwritten sources — 810 × 1250 px, too
 * dense to read at a panel's width without zoom and pan. Deliberately no
 * highlight of any kind: `pages.region` is NULL on every one of the 155
 * pages, so nothing here can promise to point at a passage on the image.
 *
 * V1.6, Nicolas #4: "afficher l'image du journal de bord ou de ma vie en
 * entier" — the frame caps the image at 32rem tall with `overflow: hidden`
 * (PageViewer.module.css), and the zoom floor used to be the image's own
 * NATIVE size (1×) regardless of how much smaller the frame was — on a
 * measured 782×514px frame showing a 780×1285px scan, only the top third
 * was ever visible, with no way to zoom OUT far enough to see the rest.
 * `fitScale` — measured from the frame's real rendered size, never assumed
 * — is now both the default AND the zoom floor: the whole page is visible
 * on open, and "Zoom arrière" can always return to it.
 */
export function PageViewer({ page, large = false }: Props): React.JSX.Element {
  const frameRef = useRef<HTMLDivElement>(null);
  // Defaults to 1 (native size) — exactly the old, safe behaviour — until a
  // real measurement lands; a frame that never lays out (some test
  // environments never do) simply keeps this default forever.
  const [fitScale, setFitScale] = useState(1);
  // `null` — no manual zoom yet — tracks `fitScale` as the frame resizes;
  // once the person zooms, the value is THEIRS until "Réinitialiser".
  const [zoom, setZoom] = useState<number | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    if (frame === null) return;
    const measure = (): void => {
      const { width, height } = frame.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      // Never upscale a small page past its own native size by default.
      setFitScale(Math.min(width / page.width, height / page.height, 1));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => { window.removeEventListener('resize', measure); };
  }, [page.width, page.height]);

  const scale = zoom ?? fitScale;

  const zoomIn = (): void => { setZoom(Math.min(ZOOM_MAX, roundStep(scale + ZOOM_STEP))); };
  const zoomOut = (): void => { setZoom(Math.max(fitScale, roundStep(scale - ZOOM_STEP))); };
  const reset = (): void => { setZoom(null); setPan({ x: 0, y: 0 }); };

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
        ref={frameRef}
        className={[styles['frame'], large ? styles['large'] : null].filter(Boolean).join(' ')}
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
