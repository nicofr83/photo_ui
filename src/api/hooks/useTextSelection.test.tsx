import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { testQueryClient } from '../../test/renderWithProviders';
import { TextKind } from '../../shared/enums';

import { useTextSelection } from './useTextSelection';

function wrapper() {
  const client = testQueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const PASSAGE = { kind: TextKind.PASSAGE, id: 'logbook/p003/001' };
const LOG_ENTRY = { kind: TextKind.LOG_ENTRY, id: 'logbook/p003/001' };

describe('contract §4.5 — selecting texts into a task, the text equivalent of images', () => {
  test('starts empty for a fresh task', async () => {
    const { result } = renderHook(() => useTextSelection('1999-transat'), { wrapper: wrapper() });
    await waitFor(() => { expect(result.current.selected.size).toBe(0); });
  });

  test('adding a text ref makes it selected', async () => {
    const { result } = renderHook(() => useTextSelection('1999-transat'), { wrapper: wrapper() });
    await waitFor(() => { expect(result.current.selected.size).toBe(0); });

    await act(async () => { await result.current.add([PASSAGE]); });
    await waitFor(() => { expect(result.current.selected.has('passage:logbook/p003/001')).toBe(true); });
  });

  test('the couple is the key: a passage and a log entry sharing an id are both selectable', async () => {
    const { result } = renderHook(() => useTextSelection('1999-transat'), { wrapper: wrapper() });
    await waitFor(() => { expect(result.current.selected.size).toBe(0); });

    await act(async () => { await result.current.add([PASSAGE, LOG_ENTRY]); });
    await waitFor(() => { expect(result.current.selected.size).toBe(2); });
  });

  test('removing takes it back out', async () => {
    const { result } = renderHook(() => useTextSelection('1999-transat'), { wrapper: wrapper() });
    await waitFor(() => { expect(result.current.selected.size).toBe(0); });

    await act(async () => { await result.current.add([PASSAGE]); });
    await waitFor(() => { expect(result.current.selected.size).toBe(1); });
    await act(async () => { await result.current.remove([PASSAGE]); });
    await waitFor(() => { expect(result.current.selected.size).toBe(0); });
  });

  test('an unknown ref is rejected, never silently dropped', async () => {
    const { result } = renderHook(() => useTextSelection('1999-transat'), { wrapper: wrapper() });
    await waitFor(() => { expect(result.current.selected.size).toBe(0); });

    const outcome = await act(async () =>
      result.current.add([{ kind: TextKind.PASSAGE, id: 'nope/999' }]),
    );
    expect(outcome.rejected).toEqual([
      { ref: { kind: TextKind.PASSAGE, id: 'nope/999' }, reason: 'unknown_text' },
    ]);
  });
});
