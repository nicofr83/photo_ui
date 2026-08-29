import { describe, expect, test } from 'vitest';

import { InFlightRenders } from './in_flight_renders.ts';

describe('InFlightRenders', () => {
  test('two concurrent calls for the SAME key share one execution — the table of renders in flight', async () => {
    let calls = 0;
    const pool = new InFlightRenders(8);
    const work = async (): Promise<number> => {
      calls++;
      await new Promise((resolve) => { setTimeout(resolve, 10); });
      return 42;
    };

    const [a, b] = await Promise.all([pool.run('key', work), pool.run('key', work)]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(calls).toBe(1);
  });

  test('a SUBSEQUENT call for the same key, after the first finished, runs again', async () => {
    let calls = 0;
    const pool = new InFlightRenders(8);
    const work = (): Promise<number> => { calls++; return Promise.resolve(calls); };

    expect(await pool.run('key', work)).toBe(1);
    expect(await pool.run('key', work)).toBe(2);
  });

  test('never runs more than the semaphore limit at once, across DIFFERENT keys', async () => {
    let running = 0;
    let maxObserved = 0;
    const pool = new InFlightRenders(3);

    await Promise.all(Array.from({ length: 10 }, (_, i) => pool.run(`key-${String(i)}`, async () => {
      running++;
      maxObserved = Math.max(maxObserved, running);
      await new Promise((resolve) => { setTimeout(resolve, 5); });
      running--;
    })));

    expect(maxObserved).toBeLessThanOrEqual(3);
  });

  test('a failing render rejects every waiter for that key, and frees the slot for the next', async () => {
    const pool = new InFlightRenders(1);
    await expect(pool.run('key', () => Promise.reject(new Error('sips a échoué'))))
      .rejects.toThrow('sips a échoué');

    // Le slot doit être libéré : un second appel, une clé différente, passe sans blocage.
    expect(await pool.run('other', () => Promise.resolve('ok'))).toBe('ok');
  });
});
