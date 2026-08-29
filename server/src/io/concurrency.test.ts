import { expect, test } from 'vitest';

import { mapWithConcurrency } from './concurrency.ts';

test('maps every item, preserving input order regardless of finish order', async () => {
  const delays = [30, 10, 20, 5];
  const results = await mapWithConcurrency(delays, 4, async (ms, index) => {
    await new Promise((resolve) => { setTimeout(resolve, ms); });
    return index;
  });
  expect(results).toEqual([0, 1, 2, 3]);
});

test('never runs more than `limit` tasks at once', async () => {
  let running = 0;
  let maxObserved = 0;
  await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
    running++;
    maxObserved = Math.max(maxObserved, running);
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    running--;
  });
  expect(maxObserved).toBeLessThanOrEqual(3);
});

test('a failing task rejects the whole call, naming the underlying error', async () => {
  await expect(mapWithConcurrency([1, 2, 3], 2, (n) => {
    if (n === 2) throw new Error('boum');
    return n;
  })).rejects.toThrow('boum');
});

test('an empty input resolves to an empty array immediately', async () => {
  expect(await mapWithConcurrency([], 4, (n: number) => n)).toEqual([]);
});

test('a limit larger than the input still runs everything exactly once', async () => {
  const calls: number[] = [];
  await mapWithConcurrency([1, 2], 100, (n) => { calls.push(n); return n; });
  expect(calls.sort()).toEqual([1, 2]);
});
