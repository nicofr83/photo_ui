/**
 * The in-memory store behind the MSW handlers. It exists so that writes make a
 * real round trip during development and component tests — selecting a photo,
 * writing a note — instead of resolving into nothing.
 */
import { INVARIANT_PHOTOS } from '../fixtures/invariants/photos';
import type { PhotoListItem } from '../src/api/contract/photo';

export interface Store {
  photos: PhotoListItem[];
  /** Identifies the import that produced this data. Contract §9. */
  importId: string;
}

function seed(): Store {
  return { photos: structuredClone(INVARIANT_PHOTOS) as PhotoListItem[], importId: 'import_mock' };
}

export let store: Store = seed();

export function resetStore(): void {
  store = seed();
}
