import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { z } from 'zod';

import { ApiError, ContractError, apiGet, apiPost } from './client';

const server = setupServer();
beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
afterEach(() => { server.resetHandlers(); });
afterAll(() => { server.close(); });

const Schema = z.strictObject({ total: z.number() });

describe('a conforming response', () => {
  test('is parsed and returned', async () => {
    server.use(http.get('*/photos', () => HttpResponse.json({ total: 3930 })));
    await expect(apiGet('/photos', Schema)).resolves.toEqual({ total: 3930 });
  });

  test('a POST sends its body and parses the reply', async () => {
    server.use(
      http.post('*/tasks', async ({ request }) => {
        const body = (await request.json()) as { title: string };
        return HttpResponse.json({ total: body.title.length });
      }),
    );
    await expect(apiPost('/tasks', { title: 'transat' }, Schema)).resolves.toEqual({
      total: 7,
    });
  });
});

describe('INVARIANT §9.6.1 — a rejected filter throws, it never becomes an empty result', () => {
  test('a 400 throws ApiError rather than resolving', async () => {
    server.use(
      http.get('*/photos', () =>
        HttpResponse.json(
          {
            error: {
              code: 'UNKNOWN_PARAMETER',
              message: 'Paramètre inconnu : colour',
              details: { parameters: ['colour'], accepted: ['tag', 'person'] },
            },
          },
          { status: 400 },
        ),
      ),
    );
    const thrown: unknown = await apiGet('/photos', Schema).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).status).toBe(400);
    expect((thrown as ApiError).code).toBe('UNKNOWN_PARAMETER');
  });

  test('the error message is French and displayable as-is', async () => {
    server.use(
      http.get('*/photos', () =>
        HttpResponse.json(
          {
            error: {
              code: 'VOLUME_UNAVAILABLE',
              message: 'Le volume des originaux est absent.',
              details: { root: '/Volumes/OWC Envoy Ultra', envVar: 'LR_TARGET' },
            },
          },
          { status: 503 },
        ),
      ),
    );
    const thrown = (await apiGet('/photos', Schema).catch((e: unknown) => e)) as ApiError;
    expect(thrown.message).toBe('Le volume des originaux est absent.');
    expect(thrown.details).toEqual({
      root: '/Volumes/OWC Envoy Ultra',
      envVar: 'LR_TARGET',
    });
  });

  test('a 404 is an ApiError, never a null result', async () => {
    server.use(
      http.get('*/photos', () =>
        HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Photo introuvable.', details: { resource: 'photo', id: 'abc' } } },
          { status: 404 },
        ),
      ),
    );
    await expect(apiGet('/photos', Schema)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('contract drift is loud', () => {
  test('a body that breaks the contract throws and names the field', async () => {
    server.use(http.get('*/photos', () => HttpResponse.json({ total: 'beaucoup' })));
    const thrown = (await apiGet('/photos', Schema).catch((e: unknown) => e)) as ContractError;
    expect(thrown).toBeInstanceOf(ContractError);
    expect(thrown.path).toBe('total');
    expect(thrown.message).toContain('total');
  });

  test('an unannounced extra field is drift, not a silent success', async () => {
    server.use(
      http.get('*/photos', () => HttpResponse.json({ total: 1, hasCaption: false })),
    );
    await expect(apiGet('/photos', Schema)).rejects.toBeInstanceOf(ContractError);
  });

  test('a ContractError is not an ApiError — the two failures never blur', async () => {
    server.use(http.get('*/photos', () => HttpResponse.json({ total: 'beaucoup' })));
    const thrown: unknown = await apiGet('/photos', Schema).catch((e: unknown) => e);
    expect(thrown).not.toBeInstanceOf(ApiError);
  });
});

describe('a malformed error body still surfaces as a failure', () => {
  test('a 500 with no contract-shaped body is still an ApiError', async () => {
    server.use(http.get('*/photos', () => new HttpResponse('nginx crashed', { status: 500 })));
    const thrown = (await apiGet('/photos', Schema).catch((e: unknown) => e)) as ApiError;
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown.status).toBe(500);
    expect(thrown.code).toBeNull();
  });
});
