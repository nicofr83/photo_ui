import type { z } from 'zod';

import { ApiErrorEnvelopeSchema, type ApiErrorCode } from './contract/error';

/**
 * The server refused, or failed. Spec §9.6.1: this is NEVER turned into an
 * empty result — a filter that disappears returns the whole library, and that
 * has already happened twice in the pipeline.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** NULL when the response carried no contract-shaped error body. */
    readonly code: ApiErrorCode | null,
    message: string,
    readonly details: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The server answered, but not what the contract says. Distinct from ApiError
 * on purpose: one means "the request was refused", the other means "the
 * contract moved under us". Blurring them would hide a backend change behind
 * what looks like a server error.
 */
export class ContractError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = 'ContractError';
  }
}

function baseUrl(): string {
  // import.meta.env is loosely typed; narrow rather than assert.
  const configured: unknown = import.meta.env['VITE_API_BASE_URL'];
  return typeof configured === 'string' ? configured : '';
}

async function toApiError(path: string, response: Response): Promise<ApiError> {
  const raw: unknown = await response.json().catch(() => null);
  const parsed = ApiErrorEnvelopeSchema.safeParse(raw);
  if (parsed.success) {
    const { code, message, details } = parsed.data.error;
    return new ApiError(response.status, code, message, details);
  }
  // A crash upstream of the application: no contract body, but still a failure.
  return new ApiError(
    response.status,
    null,
    `${path} failed with HTTP ${String(response.status)}`,
    raw,
  );
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');

  const response = await fetch(`${baseUrl()}${path}`, { ...init, headers });

  if (!response.ok) throw await toApiError(path, response);

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const dotted = issue?.path.join('.') ?? '<root>';
    throw new ContractError(
      dotted,
      `${path} broke the contract at "${dotted}": ${issue?.message ?? 'unknown reason'}`,
    );
  }
  return parsed.data;
}

export function apiGet<T>(
  path: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  return request(path, schema, signal ? { signal } : {});
}

export function apiPost<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  return request(path, schema, { method: 'POST', body: JSON.stringify(body) });
}

export function apiPut<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  return request(path, schema, { method: 'PUT', body: JSON.stringify(body) });
}

export function apiPatch<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  return request(path, schema, { method: 'PATCH', body: JSON.stringify(body) });
}

/** No body expected back: a 204 has none, so there is nothing to validate. */
export async function apiDelete(path: string): Promise<void> {
  const response = await fetch(`${baseUrl()}${path}`, { method: 'DELETE' });
  if (!response.ok) throw await toApiError(path, response);
}
