import type { FacetBucket } from '../api/contract/photo';

import { partitionFacets } from './facetOrder';

const bucket = (value: string, count = 1): FacetBucket => ({ value, count });

describe('V1.7, Nicolas — checked facets pinned to the top, the rest alphabetical', () => {
  test('nothing checked: everything lands in `rest`, alphabetical', () => {
    const buckets = [bucket('voile'), bucket('Algès'), bucket('bateau')];
    const { pinned, rest } = partitionFacets(buckets, []);
    expect(pinned).toEqual([]);
    expect(rest.map((b) => b.value)).toEqual(['Algès', 'bateau', 'voile']);
  });

  test('a checked value moves to `pinned`, and out of `rest`', () => {
    const buckets = [bucket('voile'), bucket('bateau'), bucket('mer')];
    const { pinned, rest } = partitionFacets(buckets, ['bateau']);
    expect(pinned.map((b) => b.value)).toEqual(['bateau']);
    expect(rest.map((b) => b.value)).toEqual(['mer', 'voile']);
  });

  test('several checked values are alphabetical within `pinned` too', () => {
    const buckets = [bucket('voile'), bucket('bateau'), bucket('mer'), bucket('ancre')];
    const { pinned } = partitionFacets(buckets, ['voile', 'ancre']);
    expect(pinned.map((b) => b.value)).toEqual(['ancre', 'voile']);
  });

  test('unchecking drops a value back into `rest`, at its alphabetical place', () => {
    const buckets = [bucket('voile'), bucket('bateau'), bucket('mer')];
    const { pinned, rest } = partitionFacets(buckets, []);
    expect(pinned).toEqual([]);
    expect(rest.map((b) => b.value)).toEqual(['bateau', 'mer', 'voile']);
  });

  test('a checked value the bucket list no longer carries is simply absent — nothing fabricated', () => {
    const buckets = [bucket('voile')];
    const { pinned, rest } = partitionFacets(buckets, ['disparu']);
    expect(pinned).toEqual([]);
    expect(rest.map((b) => b.value)).toEqual(['voile']);
  });
});
