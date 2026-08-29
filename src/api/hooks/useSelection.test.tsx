import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';

import { server } from '../../../mocks/node';
import { testQueryClient } from '../../test/renderWithProviders';
import { ApiError } from '../client';

import { useSelection } from './useSelection';

function wrapper() {
  const client = testQueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const A = '05b9a4fac5df4dd28dcc1002d7ec0074';
const B = '864808752b754c10aca1dffbc93a10a2';
const HELD = 'e8bc80b75e254b7db2e1454222416813';

describe('INVARIANT §9.3 — a batch is ONE request, not one per photo', () => {
  test('adding many ids makes a single call', async () => {
    let calls = 0;
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST') calls += 1;
    });

    const { result } = renderHook(() => useSelection('1999-transat'), { wrapper: wrapper() });
    await waitFor(() => { expect(result.current.selected.size).toBe(1); });

    await act(async () => { await result.current.add([A, B]); });
    expect(calls).toBe(1);
  });
});

describe('set-union semantics', () => {
  test('re-adding a held photo is an idempotent success, not a rejection', async () => {
    const { result } = renderHook(() => useSelection('1999-transat'), { wrapper: wrapper() });
    await waitFor(() => { expect(result.current.selected.has(HELD)).toBe(true); });

    const outcome = await act(async () => result.current.add([HELD, A]));
    expect(outcome.merged).toEqual([HELD]);
    expect(outcome.added).toEqual([A]);
    expect(outcome.rejected).toEqual([]);
  });

  test('the selection converges however the calls interleave', async () => {
    const { result } = renderHook(() => useSelection('1999-transat'), { wrapper: wrapper() });
    await waitFor(() => { expect(result.current.selected.size).toBe(1); });

    await act(async () => { await result.current.add([A]); });
    await act(async () => { await result.current.add([A]); });
    await waitFor(() => { expect(result.current.selected.size).toBe(2); });
  });
});

describe('removing', () => {
  test('a removed photo leaves the selection', async () => {
    const { result } = renderHook(() => useSelection('1999-transat'), { wrapper: wrapper() });
    await waitFor(() => { expect(result.current.selected.has(HELD)).toBe(true); });

    await act(async () => { await result.current.remove([HELD]); });
    await waitFor(() => { expect(result.current.selected.has(HELD)).toBe(false); });
  });
});

describe('an unknown photo is rejected and named, never silently dropped', () => {
  test('the rejection carries the id and a reason', async () => {
    const { result } = renderHook(() => useSelection('1999-transat'), { wrapper: wrapper() });
    await waitFor(() => { expect(result.current.selected.size).toBe(1); });

    const outcome = await act(async () =>
      result.current.add(['ffffffffffffffffffffffffffffffff']),
    );
    expect(outcome.rejected).toEqual([
      { cloudAssetId: 'ffffffffffffffffffffffffffffffff', reason: 'unknown_photo' },
    ]);
  });
});

describe('a server failure rolls the optimism back and stays visible', () => {
  test('the selection returns to what the server actually holds', async () => {
    const { result } = renderHook(() => useSelection('1999-transat'), { wrapper: wrapper() });
    await waitFor(() => { expect(result.current.selected.size).toBe(1); });

    server.use(
      http.post('*/tasks/:slug/images', () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL', message: 'Panne.', details: { traceId: 't' } } },
          { status: 500 },
        ),
      ),
    );

    await act(async () => {
      await result.current.add([A]).catch(() => undefined);
    });

    await waitFor(() => { expect(result.current.selected.has(A)).toBe(false); });
    expect(result.current.error).toBeInstanceOf(ApiError);
  });
});
