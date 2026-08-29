/**
 * Spec §5.5: a note's draft survives the client — typing a note and
 * navigating away (or losing the tab) must not lose it before it is saved.
 * Scoped per task: a note is always attached to a task (or general within
 * one), never global.
 */
export interface NoteDraft {
  readonly title: string;
  readonly text: string;
}

const EMPTY: NoteDraft = { title: '', text: '' };

function key(taskSlug: string): string {
  return `photo_ui:note-draft:${taskSlug}`;
}

export function readDraft(taskSlug: string): NoteDraft {
  try {
    const raw = localStorage.getItem(key(taskSlug));
    if (raw === null) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' || parsed === null
      || typeof (parsed as Partial<NoteDraft>).title !== 'string'
      || typeof (parsed as Partial<NoteDraft>).text !== 'string'
    ) {
      return EMPTY;
    }
    return parsed as NoteDraft;
  } catch {
    // Private browsing, a full quota, a corrupted value: never crash the
    // screen over what is only a convenience.
    return EMPTY;
  }
}

export function writeDraft(taskSlug: string, draft: NoteDraft): void {
  try {
    localStorage.setItem(key(taskSlug), JSON.stringify(draft));
  } catch {
    // Same reasoning: losing the draft convenience is not worth a crash.
  }
}

export function clearDraft(taskSlug: string): void {
  try {
    localStorage.removeItem(key(taskSlug));
  } catch {
    // ignore
  }
}
