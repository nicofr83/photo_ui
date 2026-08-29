/**
 * `pg-copy-streams` ships no types and none exist on DefinitelyTyped. This is
 * the minimal shape this project actually uses: a stream that is BOTH a
 * `Writable` (so `stream.pipeline` can pipe into it) and a `pg` `Submittable`
 * (so `client.query(...)` accepts it — see `@types/pg`'s
 * `query<T extends Submittable>(queryStream: T): T` overload).
 */
declare module 'pg-copy-streams' {
  import type { Writable, Readable } from 'node:stream';
  import type { Submittable } from 'pg';

  export type CopyStreamQuery = Writable & Submittable;

  export function from(text: string, options?: Record<string, unknown>): CopyStreamQuery;
  export function to(text: string, options?: Record<string, unknown>): Readable & Submittable;
}
