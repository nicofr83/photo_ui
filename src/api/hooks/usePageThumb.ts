const DEFAULT_EDGE = 160;

/**
 * v1.5, Task 8: the list of pages shows a reduced scan, never the full-size
 * image with a CSS width — 155 scans at ~300 KB each would be 31 MB for one
 * source. No network call here, only the URL the server already serves at
 * `/pages/thumb`; the request itself happens when the browser loads the
 * `<img>`.
 */
export function usePageThumb(pageId: string, edge: number = DEFAULT_EDGE): string {
  return `/pages/thumb?pageId=${encodeURIComponent(pageId)}&edge=${String(edge)}`;
}
