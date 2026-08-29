/**
 * The in-memory store behind the MSW handlers. It exists so that writes make a
 * real round trip during development and component tests — selecting a photo,
 * writing a note — instead of resolving into nothing.
 */
import { INVARIANT_ALBUMS } from '../fixtures/invariants/albums';
import { INVARIANT_PHOTOS } from '../fixtures/invariants/photos';
import { INVARIANT_DOCUMENTS, INVARIANT_TEXTS } from '../fixtures/invariants/texts';
import type { Album } from '../src/api/contract/album';
import type { PhotoListItem } from '../src/api/contract/photo';
import type { TaskDetail } from '../src/api/contract/task';
import type { TextDocument, TextUnit } from '../src/api/contract/text';
import { TaskState } from '../src/shared/enums';
import type { Job } from '../src/api/contract/job';

export interface Store {
  photos: PhotoListItem[];
  /** Mutable so a correction (PUT /corrections) makes a real round trip. */
  texts: TextUnit[];
  /** Mutable so PUT/DELETE /ref/album-span make a real round trip. */
  albums: Album[];
  /** Mutable so PUT/DELETE /ref/web-span make a real round trip. */
  documents: TextDocument[];
  tasks: Map<string, TaskDetail>;
  /** Identifies the import that produced this data. Contract §9. */
  importId: string;
  /** Set by a test to make TASKS_ROOT unreachable. Spec §5.1. */
  tasksRootAvailable: boolean;
  /** Set by a test to make the export find an existing directory. Spec §5.6. */
  exportDirectoryExists: boolean;
  jobs: Map<string, Job>;
}

const NOW = '2026-08-29T10:00:00.000Z' as TaskDetail['createdAt'];

function seedTask(): TaskDetail {
  return {
    slug: '1999-transat', title: 'La transat, septembre-octobre 1999',
    brief: '', period: null,
    imageCount: 1, textCount: 0, noteCount: 0, orphanCount: 0,
    state: TaskState.DRAFT,
    createdAt: NOW, updatedAt: NOW, lastOpenedAt: NOW,
    exportedAt: null, exportDirectory: null,
    contentHash: 'hash-a', exportedContentHash: null,
    images: [
      {
        cloudAssetId: 'e8bc80b75e254b7db2e1454222416813',
        order: 0, note: null, selectedBecause: ['manual'], selectedAt: NOW, orphaned: false,
      },
    ],
    texts: [], notes: [],
  };
}

function seed(): Store {
  return {
    photos: structuredClone(INVARIANT_PHOTOS) as PhotoListItem[],
    texts: structuredClone(INVARIANT_TEXTS) as TextUnit[],
    albums: structuredClone(INVARIANT_ALBUMS) as Album[],
    documents: structuredClone(INVARIANT_DOCUMENTS) as TextDocument[],
    tasks: new Map([['1999-transat', seedTask()]]),
    importId: 'import_mock',
    tasksRootAvailable: true,
    exportDirectoryExists: false,
    jobs: new Map(),
  };
}

export let store: Store = seed();

export function resetStore(): void {
  store = seed();
}
