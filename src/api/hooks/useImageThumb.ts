/**
 * v1.6, A11: the sha256 a `WebDateProposal` carries is not itself a URL —
 * `GET /images/:sha256/thumb` already exists (contract §6.1, 224 px, served
 * as-is) and needs nothing built specially for it. No network call here,
 * same pattern as `usePageThumb`: the request happens when the browser loads
 * the `<img>`.
 */
export function useImageThumb(sha256: string): string {
  return `/images/${sha256}/thumb`;
}
